import type { AssetDetails, AssetPage, AssetVisibility, MediaAsset } from '../types/media'
import type { FileListingOrder } from '../utils/mediaFiles'

const SIBLINGS_PAGE_SIZE = 500
const SIBLINGS_HALF_WINDOW = SIBLINGS_PAGE_SIZE / 2
const SIBLINGS_EDGE_MARGIN = 20
const DEFAULT_SIBLINGS_SORT = 'name'

/**
 * One file of the library, its neighbours in the folder (in the order and
 * filter the explorer showed them in) and the writes on it. It follows the
 * library's realtime topic, so a change made elsewhere (a revert, a rename,
 * a deletion) shows at once.
 */
export function useFileDetails(assetId: Ref<string | undefined>, order: Ref<FileListingOrder> = ref({})) {
	const api = useMediaApi()
	const { t } = useI18n()
	const toast = useToast()
	const details = ref<AssetDetails | null>(null)
	const siblings = ref<MediaAsset[]>([])
	const siblingsOffset = ref(0)
	const siblingsTotal = ref(0)
	const { tree, reload: refreshTree } = useSharedTree()
	const isLoading = ref(false)
	const error = ref<unknown>(null)
	const isDeleted = ref(false)
	const lastFolderId = ref<string | null>(null)

	const asset = computed(() => details.value?.asset)
	const localIndex = computed(() => siblings.value.findIndex((entry) => entry.id === assetId.value))
	const index = computed(() => (localIndex.value < 0 ? -1 : siblingsOffset.value + localIndex.value))
	const total = computed(() => siblingsTotal.value)
	const previous = computed(() => (localIndex.value > 0 ? siblings.value[localIndex.value - 1] : undefined))
	const next = computed(() =>
		localIndex.value >= 0 && localIndex.value < siblings.value.length - 1 ? siblings.value[localIndex.value + 1] : undefined,
	)
	const canWrite = computed(() => Boolean(details.value?.folder.rights.write))
	const canChangeVisibility = computed(
		() => Boolean(details.value?.folder.rights.manage) && Boolean(tree.value?.isOwner),
	)

	function fetchSiblings(folderId: string, offset: number): Promise<AssetPage> {
		return api.folderAssets(folderId, {
			...order.value,
			sort: order.value.sort ?? DEFAULT_SIBLINGS_SORT,
			offset,
			limit: SIBLINGS_PAGE_SIZE,
		})
	}

	/** The page of the folder holding the file, re-read around it when it sits near an end. */
	async function loadSiblings(folderId: string, id: string): Promise<void> {
		let offset = 0
		let page = await fetchSiblings(folderId, offset)
		const holds = (candidate: AssetPage) => candidate.assets.some((entry) => entry.id === id)
		while (!holds(page) && page.assets.length > 0 && offset + page.assets.length < page.total) {
			offset += page.assets.length
			page = await fetchSiblings(folderId, offset)
		}
		const found = page.assets.findIndex((entry) => entry.id === id)
		const isInFirstHalf = offset === 0 && found < SIBLINGS_HALF_WINDOW
		const centered = found < 0 || isInFirstHalf ? offset : Math.max(0, offset + found - SIBLINGS_HALF_WINDOW)
		if (centered !== offset) page = await fetchSiblings(folderId, centered)
		siblings.value = page.assets
		siblingsOffset.value = centered
		siblingsTotal.value = page.total
	}

	function isNearWindowEdge(id: string): boolean {
		const position = siblings.value.findIndex((entry) => entry.id === id)
		if (position < 0) return true
		const hasBefore = siblingsOffset.value > 0
		const hasAfter = siblingsOffset.value + siblings.value.length < siblingsTotal.value
		return (hasBefore && position < SIBLINGS_EDGE_MARGIN) || (hasAfter && position >= siblings.value.length - SIBLINGS_EDGE_MARGIN)
	}

	function markUnavailable(cause: unknown): void {
		const wasShown = details.value?.asset.id === assetId.value
		if (wasShown && isNotFoundError(cause)) {
			isDeleted.value = true
			siblings.value = siblings.value.filter((entry) => entry.id !== assetId.value)
		}
		details.value = null
		error.value = cause
	}

	async function load(id: string, refreshSiblings = false): Promise<void> {
		isLoading.value = true
		try {
			const loaded = await api.details(id)
			const folderChanged = loaded.asset.folderId !== details.value?.asset.folderId
			details.value = loaded
			lastFolderId.value = loaded.asset.folderId
			error.value = null
			isDeleted.value = false
			if (refreshSiblings || folderChanged || isNearWindowEdge(id)) await loadSiblings(loaded.asset.folderId, id)
		} catch (cause) {
			markUnavailable(cause)
		} finally {
			isLoading.value = false
		}
	}

	function patch(changes: Partial<MediaAsset>): void {
		if (!details.value) return
		details.value = { ...details.value, asset: { ...details.value.asset, ...changes } }
		siblings.value = siblings.value.map((entry) => (entry.id === details.value?.asset.id ? { ...entry, ...changes } : entry))
	}

	async function rename(name: string): Promise<boolean> {
		const current = asset.value
		if (!current || !name || name === current.name) return false
		patch({ name })
		try {
			await api.updateAsset(current.id, { name })
			await load(current.id, true)
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
			await load(id)
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
			await load(current.id)
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
		if (assetId.value) void load(assetId.value, true)
	}

	watch(
		assetId,
		(id) => {
			if (id) void load(id)
		},
		{ immediate: true },
	)
	watch(() => JSON.stringify(order.value), refresh)
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
		load,
		refresh,
		refreshTree,
		rename,
		setAlt,
		setVisibility,
		move,
		remove,
	}
}
