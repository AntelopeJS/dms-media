import type { InjectionKey } from 'vue'
import type {
	AssetVisibility,
	BulkOutcome,
	FolderVisibility,
	MediaAsset,
	MediaFolder,
} from '../../types/media'
import { type LibraryLocation, sameLocation } from './useLibraryListing'

const LIBRARY_KEY: InjectionKey<MediaLibrary> = Symbol('dms-media-library')
const ZIP_FILENAME = 'media.zip'

export interface MediaLibraryOptions {
	/** Picker mode never navigates the dashboard and hides management actions. */
	mode: 'browse' | 'pick'
	/** Mimetype patterns a picker accepts (`image/*`); every file when empty. */
	accept?: string[]
	/** Most files a picker may still add. */
	remaining?: number
}

function matchesPattern(mimetype: string, pattern: string): boolean {
	if (pattern === '*' || pattern === '*/*') return true
	if (pattern.endsWith('/*')) return mimetype.startsWith(pattern.slice(0, -1))
	return mimetype === pattern
}

/** The explorer state and every action on the library, shared by its parts. */
export function createMediaLibrary(options: MediaLibraryOptions) {
	const api = useMediaApi()
	const { t } = useI18n()
	const toast = useToast()
	const previews = useMediaPreviews()
	const uploads = useUploadQueue()
	const tree = useLibraryTree()
	const listing = useLibraryListing()
	const selection = useLibrarySelection(listing.assets)
	const backStack = ref<LibraryLocation[]>([])
	const forwardStack = ref<LibraryLocation[]>([])
	const lastFolderId = ref<string | null>(null)
	const beforeSearch = ref<LibraryLocation>({ kind: 'root' })

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

	/** Why a picker cannot take a file, or nothing when it can. */
	function rejectionOf(asset: MediaAsset): string | undefined {
		const accept = options.accept ?? []
		if (accept.length === 0) return undefined
		if (accept.some((pattern) => matchesPattern(asset.mimetype, pattern))) return undefined
		return t('dms_media.picker.not_accepted', { types: accept.join(', ') })
	}

	function notifyFailure(error: unknown, titleKey: string): void {
		useApiError(error, { title: t(titleKey) })
	}

	async function open(next: LibraryLocation, remember = true): Promise<void> {
		if (remember && !sameLocation(next, listing.location.value)) {
			backStack.value = [...backStack.value, listing.location.value]
			forwardStack.value = []
		}
		selection.clear()
		if (next.kind !== 'search') beforeSearch.value = next
		if (next.kind === 'folder') lastFolderId.value = next.folderId
		if (next.kind === 'root') lastFolderId.value = null
		await listing.setLocation(next)
	}

	function openFolder(folderId: string | null): Promise<void> {
		return open(folderId ? { kind: 'folder', folderId } : { kind: 'root' })
	}

	async function back(): Promise<void> {
		const previous = backStack.value.at(-1)
		if (!previous) return
		backStack.value = backStack.value.slice(0, -1)
		forwardStack.value = [listing.location.value, ...forwardStack.value]
		await open(previous, false)
	}

	async function forward(): Promise<void> {
		const next = forwardStack.value[0]
		if (!next) return
		forwardStack.value = forwardStack.value.slice(1)
		backStack.value = [...backStack.value, listing.location.value]
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
		canGoBack: computed(() => backStack.value.length > 0),
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

function reportOutcome(library: LibraryCore, outcome: BulkOutcome, doneKey: string): void {
	if (outcome.refused.length === 0) {
		library.toast.add({
			title: library.t(doneKey, { count: outcome.done.length }, outcome.done.length),
			color: 'success',
			icon: 'i-ph-check-circle',
		})
		return
	}
	library.toast.add({
		title: library.t('dms_media.toasts.partial', {
			done: outcome.done.length,
			refused: outcome.refused.length,
		}),
		description: outcome.refused[0]?.message,
		color: 'warning',
		icon: 'i-ph-warning',
	})
}

/** Writes to the library, applied locally first and rolled back on failure. */
export function createLibraryActions(library: LibraryCore) {
	const { api, listing, tree, selection, t } = library

	async function renameAsset(asset: MediaAsset, name: string): Promise<boolean> {
		if (!name || name === asset.name) return false
		listing.patchAsset(asset.id, { name })
		try {
			await api.updateAsset(asset.id, { name })
			return true
		} catch (error) {
			listing.patchAsset(asset.id, { name: asset.name })
			library.notifyFailure(error, 'dms_media.toasts.rename_failed')
			return false
		}
	}

	async function setAlt(asset: MediaAsset, alt: string): Promise<boolean> {
		if (alt === (asset.alt ?? '')) return true
		listing.patchAsset(asset.id, { alt })
		try {
			await api.updateAsset(asset.id, { alt })
			const wasMissing = needsAltText(asset)
			const isMissing = needsAltText({ ...asset, alt })
			if (wasMissing !== isMissing) tree.adjustView('missingAlt', isMissing ? 1 : -1)
			return true
		} catch (error) {
			listing.patchAsset(asset.id, { alt: asset.alt })
			library.notifyFailure(error, 'dms_media.toasts.alt_failed')
			return false
		}
	}

	async function setAssetsVisibility(
		assets: MediaAsset[],
		visibility: AssetVisibility,
	): Promise<void> {
		try {
			const outcome = await api.setAssetsVisibility(
				assets.map((asset) => asset.id),
				visibility,
			)
			await listing.load()
			reportOutcome(library, outcome, 'dms_media.toasts.visibility_done')
		} catch (error) {
			library.notifyFailure(error, 'dms_media.toasts.visibility_failed')
		}
	}

	async function moveAssets(assets: MediaAsset[], folderId: string): Promise<void> {
		const ids = assets.map((asset) => asset.id)
		const sourceId = assets[0]?.folderId
		try {
			const outcome = await api.moveAssets(ids, folderId)
			listing.removeAssets(outcome.done)
			selection.forget(outcome.done)
			await tree.refresh()
			reportOutcome(library, outcome, 'dms_media.toasts.moved')
			if (sourceId && outcome.done.length > 0)
				offerUndoMove(outcome.done, sourceId)
		} catch (error) {
			library.notifyFailure(error, 'dms_media.toasts.move_failed')
		}
	}

	function offerUndoMove(ids: string[], sourceId: string): void {
		library.toast.add({
			title: t('dms_media.toasts.undo_move', { count: ids.length }, ids.length),
			color: 'neutral',
			actions: [
				{
					label: t('dms_media.actions.undo'),
					onClick: async () => {
						await api.moveAssets(ids, sourceId)
						await Promise.all([tree.refresh(), listing.load()])
					},
				},
			],
		})
	}

	async function deleteAssets(assets: MediaAsset[]): Promise<void> {
		const ids = assets.map((asset) => asset.id)
		try {
			const outcome = await api.deleteAssets(ids)
			listing.removeAssets(outcome.done)
			selection.forget(outcome.done)
			outcome.done.forEach((id) => library.previews.forget(id))
			await tree.refresh()
			reportOutcome(library, outcome, 'dms_media.toasts.deleted')
		} catch (error) {
			library.notifyFailure(error, 'dms_media.toasts.delete_failed')
		}
	}

	async function toggleStar(target: MediaAsset | MediaFolder, kind: 'asset' | 'folder') {
		const starred = !target.starred
		if (kind === 'asset') listing.patchAsset(target.id, { starred })
		else tree.patchFolder(target.id, { starred })
		tree.adjustView('starred', starred ? 1 : -1)
		try {
			await api.star(kind, target.id, starred)
		} catch (error) {
			if (kind === 'asset') listing.patchAsset(target.id, { starred: !starred })
			else tree.patchFolder(target.id, { starred: !starred })
			tree.adjustView('starred', starred ? -1 : 1)
			library.notifyFailure(error, 'dms_media.toasts.star_failed')
		}
	}

	async function downloadZip(assets: MediaAsset[]): Promise<void> {
		try {
			const blob = await api.zip(assets.map((asset) => asset.id))
			const url = URL.createObjectURL(blob)
			downloadFile(url, ZIP_FILENAME)
			setTimeout(() => URL.revokeObjectURL(url), 10_000)
		} catch (error) {
			library.notifyFailure(error, 'dms_media.toasts.zip_failed')
		}
	}

	async function downloadAsset(asset: MediaAsset): Promise<void> {
		try {
			const { url } = await api.readUrl(asset.id)
			downloadFile(url, asset.name)
		} catch (error) {
			library.notifyFailure(error, 'dms_media.toasts.download_failed')
		}
	}

	return {
		renameAsset,
		setAlt,
		setAssetsVisibility,
		moveAssets,
		deleteAssets,
		toggleStar,
		downloadZip,
		downloadAsset,
		...createFolderActions(library),
	}
}

function createFolderActions(library: LibraryCore) {
	const { api, tree, t } = library

	async function createFolder(name: string, parentId?: string): Promise<string | null> {
		try {
			const { id } = await api.createFolder(name, parentId)
			await tree.refresh()
			library.toast.add({
				title: t('dms_media.toasts.folder_created', { name }),
				color: 'success',
				icon: 'i-ph-folder-plus',
			})
			return id
		} catch (error) {
			library.notifyFailure(error, 'dms_media.toasts.folder_create_failed')
			return null
		}
	}

	async function renameFolder(folder: MediaFolder, name: string): Promise<boolean> {
		if (!name || name === folder.name) return false
		tree.patchFolder(folder.id, { name })
		try {
			await api.renameFolder(folder.id, name)
			return true
		} catch (error) {
			tree.patchFolder(folder.id, { name: folder.name })
			library.notifyFailure(error, 'dms_media.toasts.rename_failed')
			return false
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
