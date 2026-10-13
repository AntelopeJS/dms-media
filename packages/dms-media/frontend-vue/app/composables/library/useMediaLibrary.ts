import type { InjectionKey } from 'vue'
import type {
	AssetVisibility,
	BulkOutcome,
	BulkRefusal,
	FolderVisibility,
	MediaAsset,
	MediaFolder,
} from '../../types/media'
import { type LibraryLocation, sameLocation } from './useLibraryListing'

const LIBRARY_KEY: InjectionKey<MediaLibrary> = Symbol('dms-media-library')

export interface MediaLibraryOptions {
	/** Picker mode never navigates the dashboard and hides management actions. */
	mode: 'browse' | 'pick'
	/** Mimetype patterns a picker accepts (`image/*`); every file when empty. */
	accept?: string[]
	/** Most files a picker may still add. */
	remaining?: number
	/** The folder a picker is kept inside, when its field is bound to one. */
	scopeFolderId?: string
	/** Files the picker's field already holds: shown, but not picked twice. */
	alreadyPicked?: string[]
}

/** What a name dialog learns from a write: whether it is done, or the refusal to show under the field. */
export interface NameOutcome {
	isDone: boolean
	id?: string
	fieldError?: string
}

/** The explorer state and every action on the library, shared by its parts. */
function createMediaLibrary(options: MediaLibraryOptions) {
	const api = useMediaApi()
	const { t } = useI18n()
	const toast = useToast()
	const previews = useMediaPreviews()
	const uploads = useUploadQueue()
	const tree = useLibraryTree({ scopeFolderId: options.scopeFolderId })
	const listing = useLibraryListing({ scopeFolderId: options.scopeFolderId, tree })
	const isPick = options.mode === 'pick'
	const selection = useLibrarySelection(listing.assets, isPick)
	const backStack = ref<LibraryLocation[]>([])
	const forwardStack = ref<LibraryLocation[]>([])
	const lastFolderId = ref<string | null>(null)
	const beforeSearch = ref<LibraryLocation>({ kind: 'root' })
	const accept = options.accept ?? []
	const alreadyPicked = new Set(options.alreadyPicked ?? [])

	const currentFolder = computed(() => {
		const current = listing.location.value
		return current.kind === 'folder'
			? tree.foldersById.value.get(current.folderId)
			: undefined
	})

	const visibleFolders = computed<MediaFolder[]>(() => {
		const current = listing.location.value
		if (current.kind === 'root') return tree.childrenOf(null)
		if (current.kind === 'folder') return tree.childrenOf(current.folderId)
		return listing.extraFolders.value
	})

	const acceptedTypes = computed(() => fieldTypesLabel(accept, t))

	/** Why a picker cannot take a file, or nothing when it can. */
	function rejectionOf(asset: MediaAsset): string | undefined {
		if (alreadyPicked.has(asset.id)) return t('dms_media.picker.already_added')
		if (!acceptedTypes.value) return undefined
		if (matchesUploadType(asset.mimetype, accept)) return undefined
		return t('dms_media.picker.not_accepted', { types: acceptedTypes.value })
	}

	function notifyFailure(error: unknown, titleKey: string): void {
		useApiError(error, { title: t(titleKey) })
	}

	async function open(next: LibraryLocation, remember = true): Promise<void> {
		if (remember && !sameLocation(next, listing.location.value)) {
			backStack.value = [...backStack.value, listing.location.value]
			forwardStack.value = []
		}
		if (!isPick) selection.clear()
		if (next.kind !== 'search') beforeSearch.value = next
		if (next.kind === 'folder') lastFolderId.value = next.folderId
		if (next.kind === 'root') lastFolderId.value = null
		await listing.setLocation(next)
	}

	function openFolder(folderId: string | null): Promise<void> {
		return open(folderId ? { kind: 'folder', folderId } : { kind: 'root' })
	}

	const isSearching = computed(() => listing.location.value.kind === 'search')

	async function back(): Promise<void> {
		const current = listing.location.value
		if (current.kind === 'search') {
			forwardStack.value = [current, ...forwardStack.value]
			return open(beforeSearch.value, false)
		}
		const previous = backStack.value.at(-1)
		if (!previous) return
		backStack.value = backStack.value.slice(0, -1)
		forwardStack.value = [current, ...forwardStack.value]
		await open(previous, false)
	}

	async function forward(): Promise<void> {
		const next = forwardStack.value[0]
		if (!next) return
		forwardStack.value = forwardStack.value.slice(1)
		if (!isSearching.value) backStack.value = [...backStack.value, listing.location.value]
		await open(next, false)
	}

	function search(query: string, scopeId?: string): Promise<void> {
		const trimmed = query.trim()
		if (!trimmed) return clearSearch()
		return open({ kind: 'search', query: trimmed, scopeId }, false)
	}

	function clearSearch(): Promise<void> {
		return open(beforeSearch.value, false)
	}

	return {
		mode: options.mode,
		remaining: options.remaining,
		accept,
		acceptedTypesLabel: acceptedTypes,
		rejectionOf,
		api,
		t,
		toast,
		previews,
		uploads,
		tree,
		listing,
		selection,
		currentFolder,
		visibleFolders,
		lastFolderId,
		canGoBack: computed(() => isSearching.value || backStack.value.length > 0),
		canGoForward: computed(() => forwardStack.value.length > 0),
		notifyFailure,
		open,
		openFolder,
		back,
		forward,
		search,
		clearSearch,
	}
}

type LibraryCore = ReturnType<typeof createMediaLibrary>

interface ToastAction {
	label: string
	onClick: () => void | Promise<void>
}

interface GoneSplit {
	outcome: BulkOutcome
	gone: string[]
}

interface OutcomeReport {
	doneKey: string
	params?: Record<string, unknown>
	actions?: ToastAction[]
	duration?: number
}

const UNDO_TOAST_MS = 10_000
const ZIP_URL_TTL_MS = 10_000
const ZIP_FALLBACK_NAME = 'media'
const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]+/g
const NAME_FIELD = 'name'
const NAME_ERROR_CODES: Record<string, typeof NAME_FIELD> = Object.fromEntries(
	['name_required', 'name_too_long', 'name_forbidden', 'name_taken', 'folder_name_taken'].map((code) => [
		`$dms_media.errors.${code}`,
		NAME_FIELD,
	]),
)

type Translate = LibraryCore['t']

/** A refusal about the typed name, shown under the name field instead of a toast. */
function nameFieldError(t: Translate, error: unknown): string | undefined {
	const [refusal] = resolveFieldErrors(error, { fields: [NAME_FIELD], codes: NAME_ERROR_CODES }).fields
	return refusal && resolveApiMessage(t, refusal.message, refusal.params)
}

function isGoneRefusal(refusal: BulkRefusal): boolean {
	return refusal.status === HTTP_NOT_FOUND
}

function refusedMessage(t: Translate, outcome: BulkOutcome): string | undefined {
	const message = outcome.refused[0]?.message
	return message ? resolveApiMessage(t, message) : undefined
}

function reportOutcome(library: LibraryCore, outcome: BulkOutcome, report: OutcomeReport): void {
	const { t } = library
	const count = outcome.done.length
	const isComplete = outcome.refused.length === 0
	library.toast.add({
		title: isComplete
			? t(report.doneKey, { count, ...report.params }, count)
			: t('dms_media.toasts.partial', { done: count, refused: outcome.refused.length }),
		description: refusedMessage(t, outcome),
		color: isComplete ? 'success' : 'warning',
		icon: isComplete ? 'i-ph-check-circle' : 'i-ph-warning',
		actions: count > 0 ? report.actions : undefined,
		duration: report.actions && count > 0 ? report.duration : undefined,
	})
}

/** A refused bulk outcome where files deleted meanwhile count as gone, not refused. */
function splitGone(outcome: BulkOutcome): GoneSplit {
	const gone = outcome.refused.filter(isGoneRefusal).map((refusal) => refusal.id)
	return {
		outcome: { done: outcome.done, refused: outcome.refused.filter((refusal) => !isGoneRefusal(refusal)) },
		gone,
	}
}

function zipFileName(label: string | undefined): string {
	const base = (label ?? '').replace(UNSAFE_FILENAME_CHARS, ' ').trim() || ZIP_FALLBACK_NAME
	const day = new Date().toISOString().slice(0, 10)
	return `${base}-${day}.zip`
}

function saveBlob(blob: Blob, name: string): void {
	const url = URL.createObjectURL(blob)
	downloadFile(url, name)
	setTimeout(() => URL.revokeObjectURL(url), ZIP_URL_TTL_MS)
}

/** Drops files someone else deleted meanwhile, and says so. */
function createGoneHandler(library: LibraryCore) {
	return function forgetGone(ids: string[]): void {
		if (ids.length === 0) return
		library.listing.removeAssets(ids)
		library.selection.forget(ids)
		ids.forEach((id) => library.previews.forget(id))
		void library.tree.refresh()
		library.toast.add({
			title: library.t('dms_media.toasts.already_deleted', { count: ids.length }, ids.length),
			color: 'warning',
			icon: 'i-ph-warning',
		})
	}
}

/** Writes to a file's own details: name and alt text. */
function createDetailActions(library: LibraryCore) {
	const { api, listing, tree, t } = library
	const forgetGone = createGoneHandler(library)

	function touch(assetId: string, changes: Partial<MediaAsset>): void {
		listing.patchAsset(assetId, { ...changes, updatedAt: new Date().toISOString() })
	}

	function sortByName(): void {
		const { sort, direction } = listing.filters.value
		if (sort !== 'name') return
		const factor = direction === 'desc' ? -1 : 1
		listing.assets.value = [...listing.assets.value].sort(
			(left, right) => NAME_COLLATOR.compare(left.name, right.name) * factor,
		)
	}

	function failWrite(error: unknown, asset: MediaAsset, titleKey: string): NameOutcome {
		const fieldError = nameFieldError(t, error)
		if (fieldError) return { isDone: false, fieldError }
		if (isNotFoundError(error)) forgetGone([asset.id])
		else library.notifyFailure(error, titleKey)
		return { isDone: false }
	}

	/** Renames a file; a name already taken comes back as a field error. */
	async function renameAsset(asset: MediaAsset, name: string): Promise<NameOutcome> {
		if (!name || name === asset.name) return { isDone: true }
		try {
			await api.updateAsset(asset.id, { name })
			touch(asset.id, { name })
			sortByName()
			return { isDone: true }
		} catch (error) {
			return failWrite(error, asset, 'dms_media.toasts.rename_failed')
		}
	}

	async function setAlt(asset: MediaAsset, alt: string): Promise<boolean> {
		if (alt === (asset.alt ?? '')) return true
		touch(asset.id, { alt })
		try {
			await api.updateAsset(asset.id, { alt })
			const wasMissing = needsAltText(asset)
			const isMissing = needsAltText({ ...asset, alt })
			if (wasMissing !== isMissing) tree.adjustView('missingAlt', isMissing ? 1 : -1)
			return true
		} catch (error) {
			listing.patchAsset(asset.id, { alt: asset.alt, updatedAt: asset.updatedAt })
			failWrite(error, asset, 'dms_media.toasts.alt_failed')
			return false
		}
	}

	return { renameAsset, setAlt, forgetGone }
}

/** Moving files, with an undo that sends each one back to its own folder. */
function createMoveActions(library: LibraryCore, forgetGone: (ids: string[]) => void) {
	const { api, listing, tree, selection, t } = library

	function applyMove(ids: string[], folderId: string): void {
		if (listing.location.value.kind === 'folder') {
			listing.removeAssets(ids)
			selection.forget(ids)
			return
		}
		ids.forEach((id) => listing.patchAsset(id, { folderId }))
	}

	function groupByOrigin(ids: string[], origins: Map<string, string>): Map<string, string[]> {
		const groups = new Map<string, string[]>()
		for (const id of ids) {
			const origin = origins.get(id)
			if (origin) groups.set(origin, [...(groups.get(origin) ?? []), id])
		}
		return groups
	}

	async function undoMove(ids: string[], origins: Map<string, string>): Promise<void> {
		try {
			const groups = [...groupByOrigin(ids, origins)]
			await Promise.all(groups.map(([folderId, group]) => api.moveAssets(group, folderId)))
			await Promise.all([tree.refresh(), listing.load()])
			library.toast.add({ title: t('dms_media.toasts.move_undone'), color: 'success', icon: 'i-ph-arrow-counter-clockwise' })
		} catch (error) {
			library.notifyFailure(error, 'dms_media.toasts.undo_failed')
		}
	}

	async function moveAssets(assets: MediaAsset[], folderId: string): Promise<void> {
		const origins = new Map(assets.map((asset) => [asset.id, asset.folderId]))
		try {
			const result = splitGone(await api.moveAssets([...origins.keys()], folderId))
			applyMove(result.outcome.done, folderId)
			forgetGone(result.gone)
			await tree.refresh()
			reportOutcome(library, result.outcome, {
				doneKey: 'dms_media.toasts.moved_to',
				params: { name: tree.foldersById.value.get(folderId)?.name ?? '' },
				actions: [{ label: t('dms_media.actions.undo'), onClick: () => undoMove(result.outcome.done, origins) }],
				duration: UNDO_TOAST_MS,
			})
		} catch (error) {
			library.notifyFailure(error, 'dms_media.toasts.move_failed')
		}
	}

	return { moveAssets }
}

/** Stars, which also leave the Starred view when removed there. */
function createStarActions(library: LibraryCore) {
	const { api, listing, tree, t } = library

	function patchStar(target: MediaAsset | MediaFolder, kind: 'asset' | 'folder', starred: boolean): void {
		if (kind === 'asset') listing.patchAsset(target.id, { starred })
		else tree.patchFolder(target.id, { starred })
		tree.adjustView('starred', starred ? 1 : -1)
	}

	function isStarredView(): boolean {
		const current = listing.location.value
		return current.kind === 'view' && current.view === 'starred'
	}

	function leaveStarredView(target: MediaAsset | MediaFolder, kind: 'asset' | 'folder'): void {
		if (kind === 'asset') listing.removeAssets([target.id])
		else listing.extraFolders.value = listing.extraFolders.value.filter((folder) => folder.id !== target.id)
		library.toast.add({
			title: t('dms_media.toasts.unstarred', { name: target.name }),
			color: 'neutral',
			icon: 'i-ph-star',
			actions: [{ label: t('dms_media.actions.undo'), onClick: () => restar(target, kind) }],
		})
	}

	async function restar(target: MediaAsset | MediaFolder, kind: 'asset' | 'folder'): Promise<void> {
		try {
			await api.star(kind, target.id, true)
			tree.adjustView('starred', 1)
			await listing.load()
		} catch (error) {
			library.notifyFailure(error, 'dms_media.toasts.star_failed')
		}
	}

	async function toggleStar(target: MediaAsset | MediaFolder, kind: 'asset' | 'folder'): Promise<void> {
		const starred = !target.starred
		patchStar(target, kind, starred)
		try {
			await api.star(kind, target.id, starred)
			if (!starred && isStarredView()) leaveStarredView(target, kind)
		} catch (error) {
			patchStar(target, kind, !starred)
			library.notifyFailure(error, 'dms_media.toasts.star_failed')
		}
	}

	/** Stars every file, or removes their stars when they all have one. */
	async function starAssets(assets: MediaAsset[]): Promise<void> {
		const isEveryStarred = assets.every((asset) => asset.starred)
		const targets = assets.filter((asset) => asset.starred === isEveryStarred)
		await Promise.all(targets.map((asset) => toggleStar(asset, 'asset')))
	}

	return { toggleStar, starAssets }
}

/** Writes to the library, applied locally first and rolled back on failure. */
function createLibraryActions(library: LibraryCore) {
	const { api, listing, tree, selection } = library
	const details = createDetailActions(library)
	const assetLink = useAssetLink()
	const isZipping = ref(false)

	async function setAssetsVisibility(
		assets: MediaAsset[],
		visibility: AssetVisibility,
		doneKey = 'dms_media.toasts.visibility_done',
	): Promise<void> {
		try {
			const result = splitGone(await api.setAssetsVisibility(assets.map((asset) => asset.id), visibility))
			details.forgetGone(result.gone)
			await listing.load()
			reportOutcome(library, result.outcome, { doneKey })
		} catch (error) {
			library.notifyFailure(error, 'dms_media.toasts.visibility_failed')
		}
	}

	async function deleteAssets(assets: MediaAsset[]): Promise<void> {
		try {
			const outcome = await api.deleteAssets(assets.map((asset) => asset.id))
			const result = splitGone(outcome)
			const removed = [...result.outcome.done, ...result.gone]
			listing.removeAssets(removed)
			selection.forget(removed)
			removed.forEach((id) => library.previews.forget(id))
			await tree.refresh()
			reportOutcome(library, { done: removed, refused: result.outcome.refused }, { doneKey: 'dms_media.toasts.deleted' })
		} catch (error) {
			library.notifyFailure(error, 'dms_media.toasts.delete_failed')
		}
	}

	async function zipInto(load: () => Promise<Blob>, name: string): Promise<void> {
		if (isZipping.value) return
		isZipping.value = true
		try {
			saveBlob(await load(), name)
		} catch (error) {
			library.notifyFailure(error, 'dms_media.toasts.zip_failed')
		} finally {
			isZipping.value = false
		}
	}

	function downloadZip(assets: MediaAsset[]): Promise<void> {
		const ids = assets.map((asset) => asset.id)
		return zipInto(() => api.zip(ids), zipFileName(library.currentFolder.value?.name))
	}

	function downloadFolder(folder: MediaFolder): Promise<void> {
		return zipInto(() => api.zipFolder(folder.id), zipFileName(folder.name))
	}

	/** Saves a file under its name; the storage's own link would only show it. */
	async function downloadAsset(asset: MediaAsset): Promise<void> {
		await assetLink.download(asset)
	}

	return {
		renameAsset: details.renameAsset,
		setAlt: details.setAlt,
		setAssetsVisibility,
		deleteAssets,
		downloadZip,
		downloadFolder,
		downloadAsset,
		isZipping: readonly(isZipping),
		...createMoveActions(library, details.forgetGone),
		...createStarActions(library),
		...createFolderActions(library),
	}
}

function createFolderActions(library: LibraryCore) {
	const { api, tree, t } = library

	function failName(error: unknown, titleKey: string): NameOutcome {
		const fieldError = nameFieldError(t, error)
		if (!fieldError) library.notifyFailure(error, titleKey)
		return { isDone: false, fieldError }
	}

	/** Creates a folder; a name already taken comes back as a field error. */
	async function createFolder(name: string, parentId?: string): Promise<NameOutcome> {
		try {
			const { id } = await api.createFolder(name, parentId)
			await tree.refresh()
			library.toast.add({
				title: t('dms_media.toasts.folder_created', { name }),
				color: 'success',
				icon: 'i-ph-folder-plus',
			})
			return { isDone: true, id }
		} catch (error) {
			return failName(error, 'dms_media.toasts.folder_create_failed')
		}
	}

	async function renameFolder(folder: MediaFolder, name: string): Promise<NameOutcome> {
		if (!name || name === folder.name) return { isDone: true }
		try {
			await api.renameFolder(folder.id, name)
			tree.patchFolder(folder.id, { name })
			return { isDone: true }
		} catch (error) {
			return failName(error, 'dms_media.toasts.rename_failed')
		}
	}

	async function moveFolder(folder: MediaFolder, parentId: string | null): Promise<void> {
		try {
			await api.moveFolder(folder.id, parentId)
			await tree.refresh()
			library.toast.add({
				title: t('dms_media.toasts.folder_moved', { name: folder.name }),
				color: 'success',
			})
		} catch (error) {
			library.notifyFailure(error, 'dms_media.toasts.move_failed')
		}
	}

	async function deleteFolder(folder: MediaFolder): Promise<void> {
		try {
			await api.deleteFolder(folder.id)
			if (library.currentFolder.value?.id === folder.id)
				await library.openFolder(folder.parentId)
			await tree.refresh()
			library.toast.add({
				title: t('dms_media.toasts.folder_deleted', { name: folder.name }),
				color: 'success',
				icon: 'i-ph-trash',
			})
		} catch (error) {
			library.notifyFailure(error, 'dms_media.toasts.delete_failed')
		}
	}

	async function setFolderVisibility(
		folder: MediaFolder,
		visibility: FolderVisibility,
	): Promise<void> {
		tree.patchFolder(folder.id, { visibility })
		try {
			await api.setFolderVisibility(folder.id, visibility)
			await library.listing.load()
			library.toast.add({
				title: t(`dms_media.toasts.folder_visibility.${visibility}`, { name: folder.name }),
				color: 'success',
				icon: VISIBILITY_ICONS[visibility],
			})
		} catch (error) {
			tree.patchFolder(folder.id, { visibility: folder.visibility })
			library.notifyFailure(error, 'dms_media.toasts.visibility_failed')
		}
	}

	return { createFolder, renameFolder, moveFolder, deleteFolder, setFolderVisibility }
}

export type MediaLibrary = LibraryCore & {
	actions: ReturnType<typeof createLibraryActions>
}

export function provideMediaLibrary(options: MediaLibraryOptions): MediaLibrary {
	const core = createMediaLibrary(options)
	const library: MediaLibrary = { ...core, actions: createLibraryActions(core) }
	provide(LIBRARY_KEY, library)
	return library
}

export function useMediaLibrary(): MediaLibrary {
	const library = inject(LIBRARY_KEY)
	if (!library) throw new Error('useMediaLibrary() needs a media explorer above it')
	return library
}
