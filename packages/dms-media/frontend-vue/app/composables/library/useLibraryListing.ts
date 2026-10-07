import type {
	AssetPage,
	AssetSortKey,
	AssetTypeGroup,
	MediaAsset,
	MediaFolder,
	ModifiedWindow,
	SmartView,
	SortDirection,
	TypeFacets,
	VisibilityFilter,
} from '../../types/media'

export type LibraryLocation =
	| { kind: 'root' }
	| { kind: 'folder'; folderId: string }
	| { kind: 'view'; view: SmartView }
	| { kind: 'search'; query: string; scopeId?: string }

export interface ListingFilters {
	sort: AssetSortKey
	direction: SortDirection
	type?: AssetTypeGroup
	visibility: VisibilityFilter
	modified: ModifiedWindow
}

const PAGE_SIZE = 120
const DEFAULT_FILTERS: ListingFilters = {
	sort: 'name',
	direction: 'asc',
	visibility: 'any',
	modified: 'any',
}

export function sameLocation(left: LibraryLocation, right: LibraryLocation): boolean {
	return JSON.stringify(left) === JSON.stringify(right)
}

/** What the explorer shows: the location, its files page by page and their filters. */
export function useLibraryListing() {
	const api = useMediaApi()
	const previews = useMediaPreviews()
	const location = ref<LibraryLocation>({ kind: 'root' })
	const filters = ref<ListingFilters>({ ...DEFAULT_FILTERS })
	const assets = ref<MediaAsset[]>([])
	const extraFolders = ref<MediaFolder[]>([])
	const total = ref(0)
	const facets = ref<TypeFacets>({})
	const isLoading = ref(false)
	const error = ref<unknown>(null)
	let requestId = 0

	function fetchPage(offset: number): Promise<AssetPage> | null {
		const current = location.value
		const query = {
			offset,
			limit: PAGE_SIZE,
			sort: filters.value.sort,
			direction: filters.value.direction,
			type: filters.value.type,
		}
		if (current.kind === 'folder') return api.folderAssets(current.folderId, query)
		if (current.kind === 'view') return api.smartView(current.view, query)
		if (current.kind === 'search')
			return api.search({
				...query,
				q: current.query,
				folderId: current.scopeId,
				visibility: filters.value.visibility,
				modified: filters.value.modified,
			})
		return null
	}

	function applyPage(page: AssetPage | null, append: boolean): void {
		const received = page?.assets ?? []
		assets.value = append ? [...assets.value, ...received] : received
		total.value = page?.total ?? 0
		facets.value = page?.facets ?? {}
		extraFolders.value = page?.folders ?? []
		previews.request(received)
	}

	async function load(append = false): Promise<void> {
		const id = ++requestId
		isLoading.value = true
		try {
			const page = await fetchPage(append ? assets.value.length : 0)
			if (id !== requestId) return
			applyPage(page, append)
			error.value = null
		} catch (cause) {
			if (id === requestId) error.value = cause
		} finally {
			if (id === requestId) isLoading.value = false
		}
	}

	function setLocation(next: LibraryLocation): Promise<void> {
		location.value = next
		filters.value = { ...filters.value, type: undefined }
		if (next.kind === 'view' && next.view === 'recent')
			filters.value = { ...filters.value, sort: 'date', direction: 'desc' }
		assets.value = []
		total.value = 0
		return load()
	}

	function setFilters(changes: Partial<ListingFilters>): Promise<void> {
		filters.value = { ...filters.value, ...changes }
		return load()
	}

	function patchAsset(assetId: string, changes: Partial<MediaAsset>): void {
		assets.value = assets.value.map((asset) =>
			asset.id === assetId ? { ...asset, ...changes } : asset,
		)
	}

	function removeAssets(ids: string[]): void {
		const removed = new Set(ids)
		const before = assets.value.length
		assets.value = assets.value.filter((asset) => !removed.has(asset.id))
		total.value = Math.max(total.value - (before - assets.value.length), 0)
	}

	function insertAsset(asset: MediaAsset): void {
		if (assets.value.some((entry) => entry.id === asset.id)) return
		assets.value = [asset, ...assets.value]
		total.value += 1
		previews.request([asset])
	}

	const hasMore = computed(() => assets.value.length < total.value)

	return {
		location,
		filters,
		assets,
		extraFolders,
		total,
		facets,
		isLoading,
		error,
		hasMore,
		load,
		setLocation,
		setFilters,
		patchAsset,
		removeAssets,
		insertAsset,
	}
}

export type LibraryListing = ReturnType<typeof useLibraryListing>
