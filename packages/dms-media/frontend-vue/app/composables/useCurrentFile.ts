import type { AssetSortKey, AssetTypeGroup, SortDirection } from '../types/media'
import type { FileListingOrder } from '../utils/mediaFiles'
import MediaLightbox from '../components/shared/MediaLightbox.vue'

const SORT_KEYS: readonly AssetSortKey[] = ['name', 'date', 'size', 'type']
const SORT_DIRECTIONS: readonly SortDirection[] = ['asc', 'desc']

function queryValue<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
	return allowed.find((candidate) => candidate === value)
}

/**
 * The file the file page shows, named by its `asset` query parameter. Each of
 * the page's blocks (header, viewer, properties) reads it, and they share the
 * read: a rename in the properties shows in the header at once, and a server
 * render reads the file once. Its `sort`, `direction` and `type` parameters
 * keep the explorer's order for previous and next.
 */
export function useCurrentFile() {
	const route = useDmsRoute()
	const router = useDmsRouter()
	const overlay = useOverlay()
	const createLightbox = () => overlay.create(MediaLightbox)
	let lightbox: ReturnType<typeof createLightbox> | undefined
	const assetId = computed(() => (typeof route.query.asset === 'string' ? route.query.asset : undefined))
	const order = computed<FileListingOrder>(() => ({
		sort: queryValue(route.query.sort, SORT_KEYS),
		direction: queryValue(route.query.direction, SORT_DIRECTIONS),
		type: queryValue<AssetTypeGroup>(route.query.type, TYPE_GROUP_ORDER),
	}))
	const file = useFileDetails(assetId, order)

	function open(id: string | undefined): void {
		if (id && id !== assetId.value) void router.replace({ path: route.path, query: { ...route.query, asset: id } })
	}

	/** Full-screen viewer over the folder; closing it leaves the page on the file it showed last. */
	async function fullscreen(): Promise<void> {
		const asset = file.asset.value
		if (!asset) return
		lightbox ??= createLightbox()
		const shownId = await lightbox.open({
			assets: file.siblings.value.length ? file.siblings.value : [asset],
			startId: asset.id,
			canEdit: () => file.canWrite.value,
		})
		open(shownId ?? undefined)
	}

	function edit(): void {
		const asset = file.asset.value
		if (asset && file.canWrite.value && isEditableAsset(asset)) void navigateDms(editorLink(asset.id))
	}

	return { ...file, assetId, order, open, fullscreen, edit }
}
