import DuplicateNamesDialog from '../components/dialogs/DuplicateNamesDialog.vue'
import type { MediaAsset } from '../types/media'
import type { UploadBatchReport, UploadFailureReport } from './useUploadApi'

export type UploadStatus =
	| 'waiting'
	| 'uploading'
	| 'checking'
	| 'done'
	| 'failed'
	| 'rejected'
	| 'cancelled'

/** Retryable failures, then refusals that would fail again the same way. */
export type UploadFailure =
	| 'connection'
	| 'storage'
	| 'server'
	| 'storage_limit'
	| 'storage_blocked'
	| 'storage_unreachable'
	| 'too_large'
	| 'empty'
	| 'type_not_allowed'
	| 'field_type'
	| 'quota'
	| 'invalid_image'
	| 'folder_gone'
	| 'no_access'
	| 'invalid'
	| 'duplicate'
	| 'interrupted'

export interface UploadRefusalDetails {
	accepted?: readonly string[]
	remaining?: number
	/** The site or storage address a network refusal names. */
	address?: string
}

export interface UploadItem {
	id: string
	name: string
	size: number
	mimetype: string
	folderId: string
	folderName: string
	batchId: string
	status: UploadStatus
	loaded: number
	failure?: UploadFailure
	message?: string
	details?: UploadRefusalDetails
	resourceKey?: string
	previewUrl?: string
	asset?: MediaAsset
}

export interface UploadDestination {
	folderId: string
	folderName: string
	/** Types the field linked to the folder accepts; unrestricted when absent. */
	accepts?: readonly string[] | null
}

/** How a batch ended, once every file of it is settled. */
export interface UploadBatchOutcome {
	batchId: string
	folderId: string
	folderName: string
	total: number
	uploaded: number
	failed: number
	cancelled: number
}

type UploadListener = (asset: MediaAsset) => void
type BatchListener = (outcome: UploadBatchOutcome) => void
type UploadApi = ReturnType<typeof useUploadApi>

interface FailureOutcome {
	status: 'failed' | 'rejected'
	failure: UploadFailure
	message?: string
	details?: UploadRefusalDetails
}

interface ServerRefusal {
	reason?: string
	message?: string
	accepted?: readonly string[]
	remaining?: number
}

const CONCURRENCY = 2
const FINAL_STATUSES = new Set<UploadStatus>(['done', 'failed', 'rejected', 'cancelled'])
const CANCELLABLE_STATUSES = new Set<UploadStatus>(['waiting', 'uploading'])
const FAILED_STATUSES = new Set<UploadStatus>(['failed', 'rejected'])
const HTTP_SUCCESS_LIMIT = 300
const HTTP_CLIENT_ERROR_MIN = 400
const HTTP_SERVER_ERROR_MIN = 500
const HTTP_PAYLOAD_TOO_LARGE = 413
/** Failures the same file would meet again: no retry is offered. */
const FINAL_FAILURES = new Set<UploadFailure>(['storage_limit', 'storage_blocked', 'storage_unreachable'])
const MAX_REPORTED_FAILURES = 50
const MAX_REASON_LENGTH = 500
/** Headers a browser sets itself and refuses from a script. */
const FORBIDDEN_REQUEST_HEADERS = new Set(['content-length', 'host', 'connection', 'accept-encoding'])
const REFUSALS_BY_STATUS: Record<number, UploadFailure> = {
	400: 'invalid',
	403: 'no_access',
	404: 'folder_gone',
	413: 'quota',
	415: 'type_not_allowed',
	422: 'invalid_image',
}
const SERVER_REASONS = new Set<UploadFailure>(['type_not_allowed', 'field_type', 'quota', 'invalid_image'])

const items = ref<UploadItem[]>([])
const isPaused = ref(false)
const maxUploadBytes = ref(500 * 1024 * 1024)
const allowedMimetypes = ref<readonly string[] | null>(null)
const files = new Map<string, File>()
const requests = new Map<string, XMLHttpRequest>()
const listeners = new Set<UploadListener>()
const batchListeners = new Set<BatchListener>()
const reportedBatches = new Set<string>()
/** Batches waiting on the duplicate names question: nothing of them is sent yet. */
const heldBatches = reactive(new Set<string>())
let sequence = 0
let uploadApi: UploadApi | undefined
let isUnloadGuarded = false

function nextId(): string {
	sequence += 1
	return `upload-${Date.now().toString(36)}-${sequence}`
}

function findItem(id: string): UploadItem | undefined {
	return items.value.find((item) => item.id === id)
}

function patch(id: string, changes: Partial<UploadItem>): void {
	const index = items.value.findIndex((item) => item.id === id)
	if (index < 0) return
	items.value[index] = { ...items.value[index]!, ...changes }
}

function isFinal(item: UploadItem): boolean {
	return FINAL_STATUSES.has(item.status)
}

function isCancelled(id: string): boolean {
	return findItem(id)?.status !== 'uploading'
}

function api(): UploadApi {
	if (!uploadApi) throw new Error('useUploadQueue() must run in a component setup first')
	return uploadApi
}

function storageFailure(status: number): UploadFailure {
	return status === HTTP_PAYLOAD_TOO_LARGE ? 'storage_limit' : 'storage'
}

class UploadError extends Error {
	constructor(
		readonly failure: UploadFailure,
		message?: string,
		readonly details?: UploadRefusalDetails,
	) {
		super(message ?? failure)
	}
}

/** A network error tells a dropped link from a storage this site may not reach (CORS, wrong address). */
async function networkFailure(url: string, hasSentBytes: boolean): Promise<UploadError> {
	const { failure, address } = await diagnoseStorageFailure(url, hasSentBytes)
	if (failure === 'connection') return new UploadError('connection')
	return new UploadError(failure, address, { address })
}

function putFile(id: string, url: string, headers: Record<string, string>, file: File): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const request = new XMLHttpRequest()
		let sentBytes = 0
		requests.set(id, request)
		request.open('PUT', url)
		for (const [name, value] of Object.entries(headers)) {
			if (!FORBIDDEN_REQUEST_HEADERS.has(name.toLowerCase())) request.setRequestHeader(name, value)
		}
		request.upload.onprogress = (event) => {
			sentBytes = event.loaded
			patch(id, { loaded: event.loaded })
		}
		request.onload = () =>
			request.status < HTTP_SUCCESS_LIMIT ? resolve() : reject(new UploadError(storageFailure(request.status), String(request.status)))
		request.onerror = () => void networkFailure(url, sentBytes > 0).then(reject)
		request.onabort = () => reject(new UploadError('connection', 'aborted'))
		request.send(file)
	}).finally(() => requests.delete(id))
}

function httpStatusOf(error: unknown): number | undefined {
	const response = error as { statusCode?: number; status?: number } | undefined
	return response?.statusCode ?? response?.status
}

function refusalOf(error: unknown): ServerRefusal {
	const data = (error as { data?: unknown } | undefined)?.data
	if (typeof data === 'string') return { message: data }
	return (data as ServerRefusal | undefined) ?? {}
}

/** A 4xx is final (retrying sends the same file again); network and 5xx can be retried. */
function describeFailure(error: unknown): FailureOutcome {
	if (error instanceof UploadError)
		return {
			status: FINAL_FAILURES.has(error.failure) ? 'rejected' : 'failed',
			failure: error.failure,
			message: error.message,
			details: error.details,
		}
	const status = httpStatusOf(error)
	const refusal = refusalOf(error)
	if (!status) return { status: 'failed', failure: 'connection' }
	if (status < HTTP_CLIENT_ERROR_MIN || status >= HTTP_SERVER_ERROR_MIN)
		return { status: 'failed', failure: 'server', message: refusal.message }
	const reason = refusal.reason as UploadFailure | undefined
	return {
		status: 'rejected',
		failure: reason && SERVER_REASONS.has(reason) ? reason : (REFUSALS_BY_STATUS[status] ?? 'invalid'),
		message: refusal.message,
		details: { accepted: refusal.accepted, remaining: refusal.remaining },
	}
}

function discardStaged(item: UploadItem): void {
	if (item.resourceKey) void api().abort(item.folderId, item.resourceKey).catch(() => undefined)
}

async function run(item: UploadItem): Promise<void> {
	const file = files.get(item.id)
	if (!file) return
	patch(item.id, { status: 'uploading', loaded: 0, resourceKey: undefined })
	try {
		const presign = await api().presign(item.folderId, file)
		patch(item.id, { resourceKey: presign.resourceKey })
		if (isCancelled(item.id)) return discardStaged(findItem(item.id)!)
		await putFile(item.id, presign.uploadUrl, presign.headers, file)
		if (isCancelled(item.id)) return
		patch(item.id, { status: 'checking', loaded: item.size })
		const current = findItem(item.id)!
		const { asset } = await api().confirm({
			folderId: current.folderId,
			resourceKey: presign.resourceKey,
			filename: current.name,
			batchId: current.batchId,
		})
		patch(item.id, { status: 'done', asset, resourceKey: undefined })
		files.delete(item.id)
		listeners.forEach((listener) => listener(asset))
	} catch (error) {
		const current = findItem(item.id)
		if (!current || current.status === 'cancelled') return
		if (current.status === 'uploading') discardStaged(current)
		patch(item.id, { ...describeFailure(error), resourceKey: undefined })
	}
}

function pump(): void {
	if (isPaused.value) return
	const active = items.value.filter((item) => item.status === 'uploading' || item.status === 'checking').length
	const waiting = items.value.filter((item) => item.status === 'waiting' && !heldBatches.has(item.batchId))
	for (const item of waiting.slice(0, Math.max(CONCURRENCY - active, 0))) {
		void run(item).finally(() => {
			reportSettledBatches()
			pump()
		})
	}
}

function failureReason(item: UploadItem): string {
	return (item.message && item.message !== item.failure ? `${item.failure}: ${item.message}` : (item.failure ?? 'server')).slice(
		0,
		MAX_REASON_LENGTH,
	)
}

function buildReport(batchId: string, batch: UploadItem[]): UploadBatchReport {
	const done = batch.filter((item) => item.status === 'done')
	const failures: UploadFailureReport[] = batch
		.filter((item) => FAILED_STATUSES.has(item.status))
		.slice(0, MAX_REPORTED_FAILURES)
		.map((item) => ({ name: item.name, reason: failureReason(item) }))
	return {
		batchId,
		folderId: batch[0]!.folderId,
		total: batch.length,
		uploaded: done.length,
		failed: batch.filter((item) => FAILED_STATUSES.has(item.status)).length,
		size: done.reduce((total, item) => total + item.size, 0),
		failures,
	}
}

function outcomeOf(report: UploadBatchReport, batch: UploadItem[]): UploadBatchOutcome {
	return {
		batchId: report.batchId,
		folderId: report.folderId,
		folderName: batch[0]!.folderName,
		total: report.total,
		uploaded: report.uploaded,
		failed: report.failed,
		cancelled: batch.filter((item) => item.status === 'cancelled').length,
	}
}

function batchesById(): Map<string, UploadItem[]> {
	const batches = new Map<string, UploadItem[]>()
	for (const item of items.value) batches.set(item.batchId, [...(batches.get(item.batchId) ?? []), item])
	return batches
}

function reportSettledBatches(): void {
	for (const [batchId, batch] of batchesById()) {
		if (reportedBatches.has(batchId) || !batch.every(isFinal)) continue
		reportedBatches.add(batchId)
		const report = buildReport(batchId, batch)
		batchListeners.forEach((listener) => listener(outcomeOf(report, batch)))
		if (report.uploaded + report.failed > 0) void api().reportBatch(report).catch(() => undefined)
	}
}

/** The page is going away mid-upload: record what never made it. */
function reportInterruptedBatches(): void {
	for (const [batchId, batch] of batchesById()) {
		if (reportedBatches.has(batchId) || batch.every(isFinal)) continue
		reportedBatches.add(batchId)
		const settled = batch.map((item) =>
			isFinal(item) ? item : { ...item, status: 'failed' as const, failure: 'interrupted' as const },
		)
		void api()
			.reportBatch(buildReport(batchId, settled), { keepalive: true })
			.catch(() => undefined)
	}
}

function hasActiveUploads(): boolean {
	return items.value.some((item) => !isFinal(item))
}

function guardUnload(): void {
	if (isUnloadGuarded || typeof window === 'undefined') return
	isUnloadGuarded = true
	window.addEventListener('beforeunload', (event) => {
		if (!hasActiveUploads()) return
		event.preventDefault()
		event.returnValue = ''
	})
	window.addEventListener('pagehide', reportInterruptedBatches)
}

function isTypeRefused(file: File): boolean {
	if (isActiveDocument(file)) return true
	return Boolean(allowedMimetypes.value && !matchesUploadType(uploadMimetype(file), allowedMimetypes.value))
}

/** Refusals known before sending: the server would answer the same. */
function initialRefusal(file: File, destination: UploadDestination): Pick<UploadItem, 'status' | 'failure' | 'details'> {
	if (file.size === 0) return { status: 'rejected', failure: 'empty' }
	if (file.size > maxUploadBytes.value) return { status: 'rejected', failure: 'too_large' }
	if (isTypeRefused(file)) return { status: 'rejected', failure: 'type_not_allowed' }
	const accepts = destination.accepts
	if (accepts?.length && !matchesUploadType(uploadMimetype(file), accepts))
		return { status: 'rejected', failure: 'field_type', details: { accepted: accepts } }
	return { status: 'waiting' }
}

function revokePreview(item: UploadItem): void {
	if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
}

function createItem(file: File, destination: UploadDestination, batchId: string): UploadItem {
	const id = nextId()
	files.set(id, file)
	return {
		id,
		name: file.name,
		size: file.size,
		mimetype: file.type,
		folderId: destination.folderId,
		folderName: destination.folderName,
		batchId,
		loaded: 0,
		previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
		...initialRefusal(file, destination),
	}
}

let duplicateDialog: ReturnType<ReturnType<typeof useOverlay>['create']> | undefined

function askKeepBoth(folderName: string, names: string[]): Promise<boolean> {
	duplicateDialog ??= useOverlay().create(DuplicateNamesDialog)
	return duplicateDialog.open({ folderName, names }).then((choice: unknown) => choice === true)
}

function rejectBatch(waiting: UploadItem[], error: unknown): void {
	const outcome = describeFailure(error)
	if (outcome.status !== 'rejected') return
	waiting.forEach((item) => patch(item.id, outcome))
}

/** "Keep both" renames the copies `name (2).ext`; "Cancel" leaves them out. */
async function resolveDuplicates(batchId: string): Promise<void> {
	const waiting = items.value.filter((item) => item.batchId === batchId && item.status === 'waiting')
	if (!waiting.length) return
	try {
		const { names } = await api().freeNames(
			waiting[0]!.folderId,
			waiting.map((item) => item.name),
		)
		const duplicates = waiting.flatMap((item, index) => (names[index] ? [{ item, free: names[index]! }] : []))
		if (!duplicates.length) return
		const keepBoth = await askKeepBoth(
			waiting[0]!.folderName,
			duplicates.map(({ item }) => item.name),
		)
		for (const { item, free } of duplicates) {
			if (findItem(item.id)?.status !== 'waiting') continue
			patch(item.id, keepBoth ? { name: free } : { status: 'cancelled', failure: 'duplicate' })
		}
	} catch (error) {
		rejectBatch(waiting, error)
	}
}

function enqueue(selected: File[], destination: UploadDestination): string {
	guardUnload()
	const batchId = newBatchId()
	items.value.push(...selected.map((file) => createItem(file, destination, batchId)))
	heldBatches.add(batchId)
	void resolveDuplicates(batchId).finally(() => {
		heldBatches.delete(batchId)
		reportSettledBatches()
		pump()
	})
	return batchId
}

function retry(id: string): void {
	const item = findItem(id)
	if (!item || item.status !== 'failed' || !files.has(id)) return
	reportedBatches.delete(item.batchId)
	patch(id, { status: 'waiting', failure: undefined, message: undefined, details: undefined })
	pump()
}

function retryFailed(): void {
	items.value.filter((item) => item.status === 'failed').forEach((item) => retry(item.id))
}

/** Only before the server starts checking: past that point the file is already being added. */
function cancel(id: string): void {
	const item = findItem(id)
	if (!item || !CANCELLABLE_STATUSES.has(item.status)) return
	patch(id, { status: 'cancelled' })
	requests.get(id)?.abort()
	discardStaged(item)
	files.delete(id)
	reportSettledBatches()
	pump()
}

function cancelRemaining(): void {
	items.value.filter((item) => CANCELLABLE_STATUSES.has(item.status)).forEach((item) => cancel(item.id))
}

function setPaused(paused: boolean): void {
	isPaused.value = paused
	pump()
}

function removeWhere(shouldRemove: (item: UploadItem) => boolean): void {
	const removed = items.value.filter(shouldRemove)
	removed.forEach((item) => {
		files.delete(item.id)
		revokePreview(item)
	})
	items.value = items.value.filter((item) => !removed.includes(item))
}

function clearFinished(): void {
	removeWhere((item) => isFinal(item) && item.status !== 'failed')
}

function clearFailed(): void {
	removeWhere((item) => FAILED_STATUSES.has(item.status))
}

function dismiss(id: string): void {
	removeWhere((item) => item.id === id && isFinal(item))
}

function onUploaded(listener: UploadListener): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

function onBatchSettled(listener: BatchListener): () => void {
	batchListeners.add(listener)
	return () => batchListeners.delete(listener)
}

const activeCount = computed(() => items.value.filter((item) => !isFinal(item) && !heldBatches.has(item.batchId)).length)

/**
 * The upload queue every media screen shares: files go to storage two at a
 * time, each failure stays on its own row, and a batch reports its outcome
 * once every file of it is settled.
 */
export function useUploadQueue() {
	uploadApi ??= useUploadApi()

	return {
		items: readonly(items),
		isPaused: readonly(isPaused),
		activeCount,
		maxUploadBytes,
		allowedMimetypes,
		enqueue,
		retry,
		retryFailed,
		cancel,
		cancelRemaining,
		setPaused,
		clearFinished,
		clearFailed,
		dismiss,
		onUploaded,
		onBatchSettled,
	}
}
