import type {
  AssetTypeGroup,
  ModifiedWindow,
  OrientationFilter,
  SmartView,
  VisibilityFilter,
} from "../../types/media";
import type { ListingSort } from "../useMediaPrefs";
import { createListingEdits, nextOffset } from "./listingEdits";
import { createListingRead } from "./listingRead";
import { createListingRequest } from "./listingRequest";
import type { LibraryTree } from "./useLibraryTree";

export type LibraryLocation =
  | { kind: "root" }
  | { kind: "folder"; folderId: string }
  | { kind: "view"; view: SmartView }
  | { kind: "search"; query: string; scopeId?: string };

export interface ListingFilters extends ListingSort {
  type?: AssetTypeGroup;
  visibility: VisibilityFilter;
  modified: ModifiedWindow;
  orientation: OrientationFilter;
}

export interface LibraryListingOptions {
  /** Folder a picker is bound to: searches and smart views stay inside its subtree. */
  scopeFolderId?: string;
  /** The explorer's tree, to skip folders the caller may see but not open. */
  tree?: LibraryTree;
  /** Where the listing starts, such as a link's folder: a server render reads it with the page. */
  initialLocation?: LibraryLocation;
  /** The filters a link gives the starting location. */
  initialFilters?: Partial<ListingFilters>;
}

const NARROWING_FILTERS: Omit<ListingFilters, keyof ListingSort> = {
  type: undefined,
  visibility: "any",
  modified: "any",
  orientation: "any",
};
/** The order a smart view opens in, whatever the caller sorts folders by. */
const VIEW_SORTS: Partial<Record<SmartView, ListingSort>> = {
  recent: { sort: "date", direction: "desc" },
  largest: { sort: "size", direction: "desc" },
};
export function sameLocation(
  left: LibraryLocation,
  right: LibraryLocation,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function definedFilters(
  filters: Partial<ListingFilters> = {},
): Partial<ListingFilters> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined),
  );
}

/**
 * What the explorer shows: the location, its files page by page and their
 * filters. The files are one paged read keyed by the location and the
 * filters: a return to a listing shows the pages loaded before at once, and
 * a library change reads every loaded page again.
 */
export function useLibraryListing(options: LibraryListingOptions = {}) {
  const previews = useMediaPreviews();
  const location = ref<LibraryLocation>(
    options.initialLocation ?? { kind: "root" },
  );
  const { prefs, update: updatePrefs } = useMediaPrefs();
  const preferredSort = computed(() => prefs.value.sort);
  const filters = ref<ListingFilters>({
    ...sortOf(location.value),
    ...NARROWING_FILTERS,
    ...definedFilters(options.initialFilters),
  });

  function sortOf(current: LibraryLocation): ListingSort {
    return current.kind === "view"
      ? (VIEW_SORTS[current.view] ?? preferredSort.value)
      : preferredSort.value;
  }
  const { scopeFolderId, listingKey, requestAt } = createListingRequest(
    options,
    location,
    filters,
  );

  const {
    read,
    pages,
    assets,
    total,
    facets,
    extraFolders,
    isLoading,
    error,
    hasMore,
    settled,
    load,
    loadAll,
  } = createListingRead(listingKey, requestAt);

  watch(assets, (shown) => previews.request(shown));

  async function refresh(): Promise<void> {
    const before = new Map(
      assets.value.map((asset) => [asset.id, asset.updatedAt]),
    );
    await read.refresh({ dedupe: "defer" });
    for (const asset of assets.value) {
      const previous = before.get(asset.id);
      if (previous && previous !== asset.updatedAt) previews.forget(asset.id);
    }
    previews.request(assets.value);
  }

  function setLocation(next: LibraryLocation): Promise<void> {
    const keepsNarrowing =
      location.value.kind === "search" && next.kind === "search";
    location.value = next;
    const sort = sortOf(next);
    filters.value = keepsNarrowing
      ? { ...filters.value, ...sort }
      : { ...sort, ...NARROWING_FILTERS };
    return settled();
  }

  function rememberSort(changes: Partial<ListingFilters>): void {
    const current = location.value;
    if (current.kind === "view" && VIEW_SORTS[current.view]) return;
    if (!changes.sort && !changes.direction) return;
    updatePrefs({
      sort: { sort: filters.value.sort, direction: filters.value.direction },
    });
  }

  function setFilters(changes: Partial<ListingFilters>): Promise<void> {
    filters.value = { ...filters.value, ...changes };
    rememberSort(changes);
    return settled();
  }

  const edits = createListingEdits({
    pages,
    assets,
    filters,
    hasMore,
    replacePages: (next) => {
      read.data.value = { pages: next, next: nextOffset(next) };
    },
  });

  onLibraryChange(() => location.value.kind !== "root" && refresh());

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
    ...edits,
  };
}
