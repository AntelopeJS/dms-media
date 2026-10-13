import type {
	AssetPage,
	AssetSortKey,
	AssetTypeGroup,
	ListingParams,
	MediaAsset,
	MediaFolder,
	ModifiedWindow,
	OrientationFilter,
	SmartView,
	SortDirection,
	TypeFacets,
	VisibilityFilter,
} from '../../types/media'
import type { ListingSort } from '../useMediaPrefs'
import type { LibraryTree } from './useLibraryTree'

export type LibraryLocation =
	| { kind: 'root' }
	| { kind: 'folder'; folderId: string }
	| { kind: 'view'; view: SmartView }
	| { kind: 'search'; query: string; scopeId?: string }

export interface ListingFilters extends ListingSort {
	type?: AssetTypeGroup
	visibility: VisibilityFilter
	modified: ModifiedWindow
	orientation: OrientationFilter
}

export interface LibraryListingOptions {
	/** Folder a picker is bound to: searches and smart views stay inside its subtree. */
	scopeFolderId?: string
	/** The explorer's tree, to skip folders the caller may see but not open. */
	tree?: LibraryTree
}

type AssetComparator = (left: MediaAsset, right: MediaAsset) => number

const PAGE_SIZE = 120
/** Largest page the API serves, used to reload or complete a long listing. */
const MAX_PAGE_SIZE = 500
const NARROWING_FILTERS: Omit<ListingFilters, keyof ListingSort> = {
	type: undefined,
	visibility: 'any',
	modified: 'any',
	orientation: 'any',
}
/** The order a smart view opens in, whatever the caller sorts folders by. */
const VIEW_SORTS: Partial<Record<SmartView, ListingSort>> = {
	recent: { sort: 'date', direction: 'desc' },
	largest: { sort: 'size', direction: 'desc' },
}
const COMPARATORS: Record<AssetSortKey, AssetComparator> = {
	name: (left, right) => NAME_COLLATOR.compare(left.name, right.name),
	date: (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
	size: (left, right) => left.size - right.size,
	type: (left, right) => NAME_COLLATOR.compare(left.mimetype, right.mimetype) || NAME_COLLATOR.compare(left.name, right.name),
}
const DIRECTION_FACTORS: Record<SortDirection, number> = { asc: 1, desc: -1 }
const EMPTY_PAGE: AssetPage = { assets: [], total: 0, facets: {} }

export function sameLocation(left: LibraryLocation, right: LibraryLocation): boolean {
	return JSON.stringify(left) === JSON.stringify(right)
}

/** Where `asset` belongs among `assets` already in the listing's order. */
function sortedIndex(assets: MediaAsset[], asset: MediaAsset, sort: ListingSort): number {
	const compare = COMPARATORS[sort.sort]
	const factor = DIRECTION_FACTORS[sort.direction]
	const index = assets.findIndex((entry) => compare(asset, entry) * factor < 0)
	return index < 0 ? assets.length : index
}

/** What the explorer shows: the location, its files page by page and their filters. */
export function useLibraryListing(options: LibraryListingOptions = {}) {
	const api = useMediaApi()
	const previews = useMediaPreviews()
	const location = ref<LibraryLocation>({ kind: 'root' })
	const { prefs, update: updatePrefs } = useMediaPrefs()
	const preferredSort = computed(() => prefs.value.sort)
	const filters = ref<ListingFilters>({ ...preferredSort.value, ...NARROWING_FILTERS })
	const assets = ref<MediaAsset[]>([])
	const extraFolders = ref<MediaFolder[]>([])
	const total = ref(0)
	const facets = ref<TypeFacets>({})
	const isLoading = ref(false)
	const error = ref<unknown>(null)
	let requestId = 0

	/** The picker's bound folder, once the tree confirms the caller can see it. */
	const scopeFolderId = computed(() => {
		const id = options.scopeFolderId
		if (!id || !options.tree) return id
		return options.tree.foldersById.value.has(id) ? id : undefined
	})

	function isUnreadable(folderId: string): boolean {
		const folder = options.tree?.foldersById.value.get(folderId)
		return Boolean(folder && (folder.shell || !folder.rights.read))
	}

	function queryFor(offset: number, limit: number): ListingParams {
		const { sort, direction, type, visibility, modified, orientation } = filters.value
		return { offset, limit, sort, direction, type, visibility, modified, orientation }
	}

	function fetchPage(offset: number, limit = PAGE_SIZE): Promise<AssetPage> | null {
		const current = location.value
		const query = queryFor(offset, limit)
		if (current.kind === 'folder')
			return isUnreadable(current.folderId) ? Promise.resolve(EMPTY_PAGE) : api.folderAssets(current.folderId, query)
		if (current.kind === 'view') return api.smartView(current.view, { ...query, folderId: scopeFolderId.value })
		if (current.kind === 'search')
			return api.search({ ...query, q: current.query, folderId: current.scopeId ?? scopeFolderId.value })
		return null
	}

	/** Every file up to `count`, fetched in the largest pages the API serves. */
	async function fetchFirst(count: number): Promise<AssetPage | null> {
		const first = await fetchPage(0, Math.min(Math.max(count, PAGE_SIZE), MAX_PAGE_SIZE))
		if (!first) return null
		const received = [...first.assets]
		while (received.length < Math.min(count, first.total)) {
			const next = await fetchPage(received.length, MAX_PAGE_SIZE)
			if (!next || next.assets.length === 0) break
			received.push(...next.assets)
		}
		return { ...first, assets: received }
	}

	function applyPage(page: AssetPage | null, append: boolean): void {
		const received = page?.assets ?? []
		assets.value = append ? [...assets.value, ...received] : received
		total.value = page?.total ?? 0
		facets.value = page?.facets ?? {}
		extraFolders.value = page?.folders ?? []
		previews.request(received)
	}

	async function run(fetch: () => Promise<AssetPage | null> | null, append: boolean, quiet = false): Promise<void> {
		const id = ++requestId
		if (!quiet) isLoading.value = true
		try {
			const page = await fetch()
			if (id !== requestId) return
			applyPage(page, append)
			error.value = null
		} catch (cause) {
			if (id === requestId && !quiet) error.value = cause
		} finally {
			if (id === requestId) isLoading.value = false
		}
	}

	function load(append = false): Promise<void> {
		return run(() => fetchPage(append ? assets.value.length : 0), append)
	}

	/** Loads the files not fetched yet, so a selection or an action covers the whole listing. */
	function loadAll(): Promise<void> {
		if (assets.value.length >= total.value) return Promise.resolve()
		return run(() => fetchFirst(total.value), false)
	}

	/** Re-reads what is on screen after a change elsewhere, keeping as many files as were loaded. */
	function refresh(): Promise<void> {
		const before = new Map(assets.value.map((asset) => [asset.id, asset.updatedAt]))
		return run(() => fetchFirst(assets.value.length), false, true).then(() => {
			for (const asset of assets.value) {
				const previous = before.get(asset.id)
				if (previous && previous !== asset.updatedAt) previews.forget(asset.id)
			}
			previews.request(assets.value)
		})
	}

	function setLocation(next: LibraryLocation): Promise<void> {
		const keepsNarrowing = location.value.kind === 'search' && next.kind === 'search'
		location.value = next
		const sort = next.kind === 'view' ? (VIEW_SORTS[next.view] ?? preferredSort.value) : preferredSort.value
		filters.value = keepsNarrowing ? { ...filters.value, ...sort } : { ...sort, ...NARROWING_FILTERS }
		assets.value = []
		total.value = 0
		return load()
	}

	function rememberSort(changes: Partial<ListingFilters>): void {
		const current = location.value
		if (current.kind === 'view' && VIEW_SORTS[current.view]) return
		if (!changes.sort && !changes.direction) return
		updatePrefs({ sort: { sort: filters.value.sort, direction: filters.value.direction } })
	}

	function setFilters(changes: Partial<ListingFilters>): Promise<void> {
		filters.value = { ...filters.value, ...changes }
		rememberSort(changes)
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

	/** Places a new file where the current sort puts it, or only counts it when it belongs to a page not loaded yet. */
	function insertAsset(asset: MediaAsset): void {
		if (assets.value.some((entry) => entry.id === asset.id)) return
		if (filters.value.type && asset.typeGroup !== filters.value.type) return
		const index = sortedIndex(assets.value, asset, filters.value)
		total.value += 1
		if (index === assets.value.length && assets.value.length < total.value - 1) return
		assets.value = [...assets.value.slice(0, index), asset, ...assets.value.slice(index)]
		previews.request([asset])
	}

	const hasMore = computed(() => assets.value.length < total.value)

	onLibraryChange(() => location.value.kind !== 'root' && refresh())

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
		scopeFolderId,
		load,
		loadAll,
		refresh,
		setLocation,
		setFilters,
		patchAsset,
		removeAssets,
		insertAsset,
	}
}

export type LibraryListing = ReturnType<typeof useLibraryListing>
