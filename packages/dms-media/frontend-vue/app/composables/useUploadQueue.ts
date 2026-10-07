import type { MediaAsset } from '../types/media'

export type UploadStatus =
	| 'waiting'
	| 'uploading'
	| 'checking'
	| 'done'
	| 'failed'
	| 'rejected'
	| 'cancelled'

export type UploadFailure = 'too_large' | 'connection' | 'storage' | 'server'

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
	asset?: MediaAsset
}

export interface UploadDestination {
	folderId: string
	folderName: string
}

type UploadListener = (asset: MediaAsset) => void

const CONCURRENCY = 2
const FINAL_STATUSES = new Set<UploadStatus>(['done', 'failed', 'rejected', 'cancelled'])
const HTTP_SUCCESS_LIMIT = 300
/** Headers a browser sets itself and refuses from a script. */
const FORBIDDEN_REQUEST_HEADERS = new Set(['content-length', 'host', 'connection', 'accept-encoding'])

const items = ref<UploadItem[]>([])
const isPaused = ref(false)
const maxUploadBytes = ref(500 * 1024 * 1024)
const files = new Map<string, File>()
const requests = new Map<string, XMLHttpRequest>()
const listeners = new Set<UploadListener>()
const reportedBatches = new Set<string>()
let sequence = 0

function nextId(): string {
	sequence += 1
	return `upload-${Date.now().toString(36)}-${sequence}`
}

function patch(id: string, changes: Partial<UploadItem>): void {
	const index = items.value.findIndex((item) => item.id === id)
	if (index < 0) return
	items.value[index] = { ...items.value[index]!, ...changes }
}

function isFinal(item: UploadItem): boolean {
	return FINAL_STATUSES.has(item.status)
}

class UploadError extends Error {
	constructor(
		readonly failure: UploadFailure,
		message?: string,
	) {
		super(message ?? failure)
	}
}

function putFile(
	id: string,
	url: string,
	headers: Record<string, string>,
	file: File,
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const request = new XMLHttpRequest()
		requests.set(id, request)
		request.open('PUT', url)
		for (const [name, value] of Object.entries(headers)) {
			if (!FORBIDDEN_REQUEST_HEADERS.has(name.toLowerCase()))
				request.setRequestHeader(name, value)
		}
		request.upload.onprogress = (event) => patch(id, { loaded: event.loaded })
		request.onload = () =>
			request.status < HTTP_SUCCESS_LIMIT
				? resolve()
				: reject(new UploadError('storage', String(request.status)))
		request.onerror = () => reject(new UploadError('connection'))
		request.onabort = () => reject(new UploadError('connection', 'aborted'))
		request.send(file)
	}).finally(() => requests.delete(id))
}

function describeFailure(error: unknown): Pick<UploadItem, 'failure' | 'message'> {
	if (error instanceof UploadError)
		return { failure: error.failure, message: error.message }
	const data = (error as { data?: { message?: string } })?.data
	return { failure: 'server', message: data?.message ?? String(error) }
}

/**
 * The upload queue every media screen shares: files go to storage two at a
 * time, each failure stays on its own row, and a batch reports its outcome
 * once every file of it is settled.
 */
export function useUploadQueue() {
	const api = useMediaApi()

	async function run(item: UploadItem): Promise<void> {
		const file = files.get(item.id)
		if (!file) return
		patch(item.id, { status: 'uploading', loaded: 0 })
		try {
			const presign = await api.presign(item.folderId, file)
			await putFile(item.id, presign.uploadUrl, presign.headers, file)
			patch(item.id, { status: 'checking', loaded: item.size })
			const { asset } = await api.confirmUpload(
				item.folderId,
				presign.resourceKey,
				item.name,
				item.batchId,
			)
			patch(item.id, { status: 'done', asset })
			files.delete(item.id)
			listeners.forEach((listener) => listener(asset))
		} catch (error) {
			const current = items.value.find((entry) => entry.id === item.id)
			if (current?.status === 'cancelled') return
			patch(item.id, { status: 'failed', ...describeFailure(error) })
		}
	}

	function pump(): void {
		if (isPaused.value) return
		const active = items.value.filter(
			(item) => item.status === 'uploading' || item.status === 'checking',
		).length
		const waiting = items.value.filter((item) => item.status === 'waiting')
		for (const item of waiting.slice(0, Math.max(CONCURRENCY - active, 0))) {
			void run(item).finally(() => {
				reportSettledBatches()
				pump()
			})
		}
	}

	function reportSettledBatches(): void {
		const batchIds = new Set(items.value.map((item) => item.batchId))
		for (const batchId of batchIds) {
			if (reportedBatches.has(batchId)) continue
			const batch = items.value.filter((item) => item.batchId === batchId)
			if (!batch.every(isFinal)) continue
			reportedBatches.add(batchId)
			const done = batch.filter((item) => item.status === 'done')
			void api
				.reportBatch({
					batchId,
					folderId: batch[0]!.folderId,
					total: batch.length,
					uploaded: done.length,
					failed: batch.filter(
						(item) => item.status === 'failed' || item.status === 'rejected',
					).length,
					size: done.reduce((total, item) => total + item.size, 0),
				})
				.catch(() => undefined)
		}
	}

	function enqueue(selected: File[], destination: UploadDestination): string {
		const batchId = newBatchId()
		for (const file of selected) {
			const id = nextId()
			const isTooLarge = file.size > maxUploadBytes.value
			files.set(id, file)
			items.value.push({
				id,
				name: file.name,
				size: file.size,
				mimetype: file.type,
				folderId: destination.folderId,
				folderName: destination.folderName,
				batchId,
				status: isTooLarge ? 'rejected' : 'waiting',
				loaded: 0,
				failure: isTooLarge ? 'too_large' : undefined,
			})
		}
		reportSettledBatches()
		pump()
		return batchId
	}

	function retry(id: string): void {
		const item = items.value.find((entry) => entry.id === id)
		if (!item || item.status !== 'failed' || !files.has(id)) return
		reportedBatches.delete(item.batchId)
		patch(id, { status: 'waiting', failure: undefined, message: undefined })
		pump()
	}

	function retryFailed(): void {
		items.value
			.filter((item) => item.status === 'failed')
			.forEach((item) => retry(item.id))
	}

	function cancel(id: string): void {
		const item = items.value.find((entry) => entry.id === id)
		if (!item || isFinal(item)) return
		patch(id, { status: 'cancelled' })
		requests.get(id)?.abort()
		files.delete(id)
		reportSettledBatches()
		pump()
	}

	function cancelRemaining(): void {
		items.value.filter((item) => !isFinal(item)).forEach((item) => cancel(item.id))
	}

	function setPaused(paused: boolean): void {
		isPaused.value = paused
		pump()
	}

	function clearFinished(): void {
		const kept = items.value.filter((item) => !isFinal(item) || item.status === 'failed')
		items.value
			.filter((item) => !kept.includes(item))
			.forEach((item) => files.delete(item.id))
		items.value = kept
	}

	function dismiss(id: string): void {
		files.delete(id)
		items.value = items.value.filter((item) => item.id !== id)
	}

	function onUploaded(listener: UploadListener): () => void {
		listeners.add(listener)
		return () => listeners.delete(listener)
	}

	const activeCount = computed(
		() => items.value.filter((item) => !isFinal(item)).length,
	)

	return {
		items: readonly(items),
		isPaused: readonly(isPaused),
		activeCount,
		maxUploadBytes,
		enqueue,
		retry,
		retryFailed,
		cancel,
		cancelRemaining,
		setPaused,
		clearFinished,
		dismiss,
		onUploaded,
	}
}
