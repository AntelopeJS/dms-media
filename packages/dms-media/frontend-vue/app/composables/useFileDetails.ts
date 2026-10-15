import type { ApiDataContext, ApiDataResult } from '#dms-core/app/composables/auth/useApiData'
import type { AssetDetails, AssetPage, AssetVisibility, MediaAsset } from '../types/media'
import type { FileListingOrder } from '../utils/mediaFiles'

const SIBLINGS_PAGE_SIZE = 500
const SIBLINGS_HALF_WINDOW = SIBLINGS_PAGE_SIZE / 2
const SIBLINGS_EDGE_MARGIN = 20
const DEFAULT_SIBLINGS_SORT = 'name'

/** The page of the file's folder the previous and next files come from. */
interface SiblingsWindow {
	folderId: string
	/** The order it was read in, as `orderKey` writes it. */
	order: string
	/** A write may have moved the file among them: the next read of the file reads them again. */
	isStale?: boolean
	assets: MediaAsset[]
	offset: number
	total: number
}

/** What the file page reads at once: the file, and the files around it in its folder. */
interface FileRead {
	details: AssetDetails
	siblings: SiblingsWindow
}

const orderKey = (order: FileListingOrder) => JSON.stringify([order.sort, order.direction, order.type])

function isNearWindowEdge(window: SiblingsWindow, id: string): boolean {
	const position = window.assets.findIndex((entry) => entry.id === id)
	if (position < 0) return true
	const hasBefore = window.offset > 0
	const hasAfter = window.offset + window.assets.length < window.total
	return (hasBefore && position < SIBLINGS_EDGE_MARGIN) || (hasAfter && position >= window.assets.length - SIBLINGS_EDGE_MARGIN)
}

/**
 * One file of the library, its neighbours in the folder (in the order and
 * filter the explorer showed them in) and the writes on it. The file and its
 * neighbours are read with the page, under one key per file: the page's blocks
 * share the read, and a server render hands it over. Moving to the next file
 * reads that file alone while it sits well inside the neighbours already read.
 * It follows the library's realtime topic, so a change made elsewhere (a
 * revert, a rename, a deletion) shows at once.
 */
export function useFileDetails(assetId: Ref<string | undefined>, order: Ref<FileListingOrder> = ref({})) {
	const api = useMediaApi()
	const { t } = useI18n()
	const toast = useToast()
	const { tree, reload: refreshTree } = useSharedTree()

	async function readSiblings(fetch: ApiDataContext['$authFetch'], signal: AbortSignal, folderId: string, id: string): Promise<SiblingsWindow> {
		const current = order.value
		const page = (offset: number) =>
			fetch<AssetPage>(MEDIA_READS.folderAssets(folderId), {
				query: { ...current, sort: current.sort ?? DEFAULT_SIBLINGS_SORT, offset, limit: SIBLINGS_PAGE_SIZE },
				signal,
			})
		let offset = 0
		let found = await page(offset)
		const holds = (candidate: AssetPage) => candidate.assets.some((entry) => entry.id === id)
		while (!holds(found) && found.assets.length > 0 && offset + found.assets.length < found.total) {
			offset += found.assets.length
			found = await page(offset)
		}
		const position = found.assets.findIndex((entry) => entry.id === id)
		const isInFirstHalf = offset === 0 && position < SIBLINGS_HALF_WINDOW
		const centered = position < 0 || isInFirstHalf ? offset : Math.max(0, offset + position - SIBLINGS_HALF_WINDOW)
		if (centered !== offset) found = await page(centered)
		return { folderId, order: orderKey(current), assets: found.assets, offset: centered, total: found.total }
	}

	const read: ApiDataResult<FileRead> = useApiData<FileRead>(
		() => (assetId.value ? `dms-media:file:${assetId.value}:${orderKey(order.value)}` : null),
		async ({ $authFetch, signal }): Promise<FileRead> => {
			const id = assetId.value!
			const details = await $authFetch<AssetDetails>(MEDIA_READS.details(id), { signal })
			// The neighbours last read, by this key or the previous file's.
			const previous = read.data.value?.siblings
			const keepsWindow =
				previous !== undefined &&
				!previous.isStale &&
				previous.folderId === details.asset.folderId &&
				previous.order === orderKey(order.value) &&
				!isNearWindowEdge(previous, id)
			return { details, siblings: keepsWindow ? previous : await readSiblings($authFetch, signal, details.asset.folderId, id) }
		},
		// Read again on each library change, its own trigger: the page's refreshes leave it alone.
		{ refreshOnPageRefresh: false },
	)

	const error = computed(() => read.error.value)
	/** A failed read shows no file, whatever it showed before. */
	const details = computed(() => (error.value ? null : (read.data.value?.details ?? null)))
	/** The file shown was deleted: it is gone on the next read, not a link to a file that never was. */
	const isDeleted = computed(
		() => isNotFoundError(error.value) && read.data.value?.details.asset.id === assetId.value,
	)
	const siblingsWindow = computed(() => read.data.value?.siblings)
	const siblings = computed(() => {
		const list = siblingsWindow.value?.assets ?? []
		return isDeleted.value ? list.filter((entry) => entry.id !== assetId.value) : list
	})
	const isLoading = computed(() => read.pending.value)
	/** The folder of the file last read, kept once it is gone. */
	const lastFolderId = computed(() => read.data.value?.details.asset.folderId ?? null)

	const asset = computed(() => details.value?.asset)
	const localIndex = computed(() => siblings.value.findIndex((entry) => entry.id === assetId.value))
	const index = computed(() => (localIndex.value < 0 ? -1 : (siblingsWindow.value?.offset ?? 0) + localIndex.value))
	const total = computed(() => siblingsWindow.value?.total ?? 0)
	const previous = computed(() => (localIndex.value > 0 ? siblings.value[localIndex.value - 1] : undefined))
	const next = computed(() =>
		localIndex.value >= 0 && localIndex.value < siblings.value.length - 1 ? siblings.value[localIndex.value + 1] : undefined,
	)
	const canWrite = computed(() => Boolean(details.value?.folder.rights.write))
	const canChangeVisibility = computed(
		() => Boolean(details.value?.folder.rights.manage) && Boolean(tree.value?.isOwner),
	)

	/**
	 * Reads the file again; with `rereadSiblings`, its neighbours too. The
	 * blocks asking at once share one request.
	 */
	function load(rereadSiblings = false): Promise<void> {
		const shown = read.data.value
		if (rereadSiblings && shown) read.data.value = { ...shown, siblings: { ...shown.siblings, isStale: true } }
		return read.refresh({ dedupe: 'defer' })
	}

	/** Shows a write at once, before the read that confirms it. */
	function patch(changes: Partial<MediaAsset>): void {
		const shown = read.data.value
		if (!shown || error.value) return
		const id = shown.details.asset.id
		read.data.value = {
			details: { ...shown.details, asset: { ...shown.details.asset, ...changes } },
			siblings: {
				...shown.siblings,
				assets: shown.siblings.assets.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)),
			},
		}
	}

	async function rename(name: string): Promise<boolean> {
		const current = asset.value
		if (!current || !name || name === current.name) return false
		patch({ name })
		try {
			await api.updateAsset(current.id, { name })
			await load(true)
			return true
		} catch (cause) {
			patch({ name: current.name })
			useApiError(cause, { title: t('dms_media.toasts.rename_failed') })
			return false
		}
	}

	async function setAlt(alt: string): Promise<boolean> {
		const current = asset.value
		if (!current) return false
		try {
			await api.updateAsset(current.id, { alt })
			patch({ alt })
			return true
		} catch (cause) {
			useApiError(cause, { title: t('dms_media.toasts.alt_failed') })
			return false
		}
	}

	async function applyVisibility(id: string, visibility: AssetVisibility): Promise<boolean> {
		try {
			const outcome = await api.setAssetsVisibility([id], visibility)
			if (outcome.refused.length) throw { data: { message: outcome.refused[0]?.message } }
			await load()
			return true
		} catch (cause) {
			useApiError(cause, { title: t('dms_media.toasts.visibility_failed') })
			return false
		}
	}

	/** Changes the file's visibility, offering to put the previous one back. */
	async function setVisibility(visibility: AssetVisibility): Promise<void> {
		const current = asset.value
		if (!current || !(await applyVisibility(current.id, visibility))) return
		toast.add({
			title: t('dms_media.file.visibility_saved'),
			color: 'success',
			icon: 'i-ph-check-circle',
			actions: [{ label: t('dms_media.actions.undo'), onClick: () => void applyVisibility(current.id, current.visibility) }],
		})
	}

	async function move(folderId: string): Promise<void> {
		const current = asset.value
		if (!current) return
		try {
			const outcome = await api.moveAssets([current.id], folderId)
			if (outcome.refused.length) throw { data: { message: outcome.refused[0]?.message } }
			await load()
			toast.add({ title: t('dms_media.toasts.moved', { count: 1 }, 1), color: 'success' })
		} catch (cause) {
			useApiError(cause, { title: t('dms_media.toasts.move_failed') })
		}
	}

	async function remove(): Promise<boolean> {
		const current = asset.value
		if (!current) return false
		try {
			const outcome = await api.deleteAssets([current.id])
			if (outcome.refused.length) throw { data: { message: outcome.refused[0]?.message } }
			toast.add({ title: t('dms_media.toasts.deleted', { count: 1 }, 1), color: 'success', icon: 'i-ph-trash' })
			return true
		} catch (cause) {
			useApiError(cause, { title: t('dms_media.toasts.delete_failed') })
			return false
		}
	}

	function refresh(): void {
		if (assetId.value) void load(true)
	}

	onLibraryChange(refresh)

	return {
		details,
		asset,
		siblings,
		tree,
		index,
		total,
		previous,
		next,
		isLoading,
		error,
		isDeleted,
		lastFolderId,
		canWrite,
		canChangeVisibility,
		refresh,
		refreshTree,
		rename,
		setAlt,
		setVisibility,
		move,
		remove,
	}
}
