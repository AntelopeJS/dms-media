import type {
	AssetPage,
	AssetSortKey,
	AssetTypeGroup,
	ListingParams,
	MediaAsset,
	MediaFolder,
	ModifiedWindow,
	OrientationFilter,
	SearchParams,
	SmartView,
	SortDirection,
	TypeFacets,
	VisibilityFilter,
} from '../../types/media'
import type { ListingSort } from '../useMediaPrefs'
import type { LibraryTree } from './useLibraryTree'

/** Where a page of the listing starts: the number of files loaded before it. */
type ListingCursor = number

interface ListingRequest {
	url: string
	query: ListingParams | SearchParams
}

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
	/** Where the listing starts, such as a link's folder: a server render reads it with the page. */
	initialLocation?: LibraryLocation
	/** The filters a link gives the starting location. */
	initialFilters?: Partial<ListingFilters>
}

type AssetComparator = (left: MediaAsset, right: MediaAsset) => number

/** A page of the listing, with the size it was asked for: a revalidation asks for the same. */
interface ListingPage extends AssetPage {
	limit: number
}

const PAGE_SIZE = 120
/** Largest page the API serves, used to complete a long listing. */
const MAX_PAGE_SIZE = 500
const LISTING_KEY_PREFIX = 'dms-media:listing:'
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
const NO_FACETS: TypeFacets = {}

export function sameLocation(left: LibraryLocation, right: LibraryLocation): boolean {
	return JSON.stringify(left) === JSON.stringify(right)
}

function definedFilters(filters: Partial<ListingFilters> = {}): Partial<ListingFilters> {
	return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined))
}

/** Where `asset` belongs among `assets` already in the listing's order. */
function sortedIndex(assets: MediaAsset[], asset: MediaAsset, sort: ListingSort): number {
	const compare = COMPARATORS[sort.sort]
	const factor = DIRECTION_FACTORS[sort.direction]
	const index = assets.findIndex((entry) => compare(asset, entry) * factor < 0)
	return index < 0 ? assets.length : index
}

function loadedCount(pages: ListingPage[]): number {
	return pages.reduce((count, page) => count + page.assets.length, 0)
}

/** Where the page after `pages` starts, or `null` once every file is loaded. */
function nextOffset(pages: ListingPage[]): number | null {
	const last = pages.at(-1)
	const loaded = loadedCount(pages)
	return last && loaded < last.total ? loaded : null
}

/** Spreads `assets` over pages of the sizes `pages` hold, the last one taking the rest. */
function spreadOver(pages: ListingPage[], assets: MediaAsset[]): ListingPage[] {
	let start = 0
	return pages.map((page, index) => {
		const end = index === pages.length - 1 ? assets.length : start + page.assets.length
		const slice = assets.slice(start, end)
		start = end
		return { ...page, assets: slice }
	})
}

/**
 * What the explorer shows: the location, its files page by page and their
 * filters. The files are one paged read keyed by the location and the
 * filters: a return to a listing shows the pages loaded before at once, and
 * a library change reads every loaded page again.
 */
export function useLibraryListing(options: LibraryListingOptions = {}) {
	const previews = useMediaPreviews()
	const location = ref<LibraryLocation>(options.initialLocation ?? { kind: 'root' })
	const { prefs, update: updatePrefs } = useMediaPrefs()
	const preferredSort = computed(() => prefs.value.sort)
	const filters = ref<ListingFilters>({
		...sortOf(location.value),
		...NARROWING_FILTERS,
		...definedFilters(options.initialFilters),
	})

	/** The order a location opens in: a smart view's own, the caller's otherwise. */
	function sortOf(current: LibraryLocation): ListingSort {
		return current.kind === 'view' ? (VIEW_SORTS[current.view] ?? preferredSort.value) : preferredSort.value
	}
	let pageLimit = PAGE_SIZE

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

	const listingKey = computed(() =>
		location.value.kind === 'root'
			? null
			: `${LISTING_KEY_PREFIX}${JSON.stringify([location.value, filters.value, scopeFolderId.value ?? null])}`,
	)

	function queryFor(offset: number, limit: number): ListingParams {
		const { sort, direction, type, visibility, modified, orientation } = filters.value
		return { offset, limit, sort, direction, type, visibility, modified, orientation }
	}

	function requestFor(current: LibraryLocation, query: ListingParams): ListingRequest | null {
		if (current.kind === 'folder')
			return isUnreadable(current.folderId) ? null : { url: MEDIA_READS.folderAssets(current.folderId), query }
		if (current.kind === 'view') return { url: MEDIA_READS.smartView(current.view), query: { ...query, folderId: scopeFolderId.value } }
		if (current.kind === 'search')
			return { url: MEDIA_READS.search, query: { ...query, q: current.query, folderId: current.scopeId ?? scopeFolderId.value } }
		return null
	}

	let shownPages = (): ListingPage[] => []

	/** The size of the page at `index`: the one it had when shown, so that a revalidation reads as many files. */
	function limitOf(index: number): number {
		return shownPages()[index]?.limit ?? pageLimit
	}

	const read = useApiPagedData<ListingPage, ListingCursor>(
		listingKey,
		async ({ $authFetch, cursor, index, signal }) => {
			const limit = limitOf(index)
			const request = requestFor(location.value, queryFor(cursor ?? 0, limit))
			const page = request ? await $authFetch<AssetPage>(request.url, { query: request.query, signal }) : EMPTY_PAGE
			return { ...page, limit }
		},
		{
			nextCursor: (page, pages) => (page.assets.length === 0 ? null : nextOffset(pages)),
			// Read again on each library change, its own trigger: the page's refreshes leave it alone.
			refreshOnPageRefresh: false,
		},
	)

	shownPages = () => (read.placeholder.value ? [] : read.pages.value)
	const pages = computed<ListingPage[]>(() => shownPages())
	const lastPage = computed(() => pages.value.at(-1))
	const assets = computed<MediaAsset[]>(() => pages.value.flatMap((page) => page.assets))
	const total = computed(() => lastPage.value?.total ?? 0)
	const facets = computed(() => lastPage.value?.facets ?? NO_FACETS)
	const extraFolders = computed<MediaFolder[]>(() => lastPage.value?.folders ?? [])
	const isLoading = computed(
		() => read.loadingMore.value || (read.pending.value && (read.placeholder.value || pages.value.length === 0)),
	)
	const error = computed(() => (listingKey.value ? read.error.value : null))
	const hasMore = computed(() => read.hasMore.value)

	watch(assets, (shown) => previews.request(shown))

	/** Resolves once the read the location or the filters started is done. */
	async function settled(): Promise<void> {
		await nextTick()
		if (!read.pending.value) return
		await new Promise<void>((resolve) => {
			const stop = watch(read.pending, (pending) => {
				if (pending) return
				stop()
				resolve()
			})
		})
	}

	/** Loads the next page, or reads the loaded ones again. */
	function load(append = false): Promise<void> {
		return append ? read.loadMore() : read.refresh()
	}

	/** Loads the files not fetched yet, in the largest pages the API serves, so a selection or an action covers the whole listing. */
	async function loadAll(): Promise<void> {
		pageLimit = MAX_PAGE_SIZE
		try {
			let loaded = -1
			while (read.hasMore.value && assets.value.length !== loaded) {
				loaded = assets.value.length
				await read.loadMore()
			}
		} finally {
			pageLimit = PAGE_SIZE
		}
	}

	/** Re-reads what is on screen after a change elsewhere, keeping as many files as were loaded. */
	async function refresh(): Promise<void> {
		const before = new Map(assets.value.map((asset) => [asset.id, asset.updatedAt]))
		await read.refresh({ dedupe: 'defer' })
		for (const asset of assets.value) {
			const previous = before.get(asset.id)
			if (previous && previous !== asset.updatedAt) previews.forget(asset.id)
		}
		previews.request(assets.value)
	}

	/** Replaces the pages shown with what `update` makes of them, the next page following. */
	function rewritePages(update: (shown: ListingPage[]) => ListingPage[]): void {
		if (pages.value.length === 0) return
		const next = update(pages.value)
		read.data.value = { pages: next, next: nextOffset(next) }
	}

	function setLocation(next: LibraryLocation): Promise<void> {
		const keepsNarrowing = location.value.kind === 'search' && next.kind === 'search'
		location.value = next
		const sort = sortOf(next)
		filters.value = keepsNarrowing ? { ...filters.value, ...sort } : { ...sort, ...NARROWING_FILTERS }
		return settled()
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
		return settled()
	}

	function patchAsset(assetId: string, changes: Partial<MediaAsset>): void {
		rewritePages((shown) =>
			shown.map((page) => ({
				...page,
				assets: page.assets.map((asset) => (asset.id === assetId ? { ...asset, ...changes } : asset)),
			})),
		)
	}

	/** Puts the loaded files in `order`, which holds the same files. */
	function reorderAssets(order: MediaAsset[]): void {
		rewritePages((shown) => spreadOver(shown, order))
	}

	function removeAssets(ids: string[]): void {
		const removed = new Set(ids)
		const count = assets.value.filter((asset) => removed.has(asset.id)).length
		rewritePages((shown) =>
			shown.map((page) => ({
				...page,
				assets: page.assets.filter((asset) => !removed.has(asset.id)),
				total: Math.max(page.total - count, 0),
			})),
		)
	}

	function removeExtraFolder(folderId: string): void {
		rewritePages((shown) =>
			shown.map((page) => ({ ...page, folders: page.folders?.filter((folder) => folder.id !== folderId) })),
		)
	}

	/** Places a new file where the current sort puts it, or only counts it when it belongs to a page not loaded yet. */
	function insertAsset(asset: MediaAsset): void {
		if (assets.value.some((entry) => entry.id === asset.id)) return
		if (filters.value.type && asset.typeGroup !== filters.value.type) return
		const index = sortedIndex(assets.value, asset, filters.value)
		const isBeyondLoaded = index === assets.value.length && hasMore.value
		const order = isBeyondLoaded ? assets.value : [...assets.value.slice(0, index), asset, ...assets.value.slice(index)]
		rewritePages((shown) => spreadOver(shown.map((page) => ({ ...page, total: page.total + 1 })), order))
	}

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
		reorderAssets,
		removeAssets,
		removeExtraFolder,
		insertAsset,
	}
}
