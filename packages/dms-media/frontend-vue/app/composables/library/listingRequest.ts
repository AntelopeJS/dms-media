import type { Ref } from "vue";
import type { ListingParams, SearchParams } from "../../types/media";
import type {
  LibraryListingOptions,
  LibraryLocation,
  ListingFilters,
} from "./useLibraryListing";

interface ListingRequest {
  url: string;
  query: ListingParams | SearchParams;
}

const LISTING_KEY_PREFIX = "dms-media:listing:";

/** What the read of the listing asks the API for, from the location and the filters. */
export function createListingRequest(
  options: LibraryListingOptions,
  location: Ref<LibraryLocation>,
  filters: Ref<ListingFilters>,
) {
  const scopeFolderId = computed(() => {
    const id = options.scopeFolderId;
    if (!id || !options.tree) return id;
    return options.tree.foldersById.value.has(id) ? id : undefined;
  });

  function isUnreadable(folderId: string): boolean {
    const folder = options.tree?.foldersById.value.get(folderId);
    return Boolean(folder && (folder.shell || !folder.rights.read));
  }

  const listingKey = computed(() =>
    location.value.kind === "root"
      ? null
      : `${LISTING_KEY_PREFIX}${JSON.stringify([location.value, filters.value, scopeFolderId.value ?? null])}`,
  );

  function queryFor(offset: number, limit: number): ListingParams {
    const { sort, direction, type, visibility, modified, orientation } =
      filters.value;
    return {
      offset,
      limit,
      sort,
      direction,
      type,
      visibility,
      modified,
      orientation,
    };
  }

  function requestAt(offset: number, limit: number): ListingRequest | null {
    const current = location.value;
    const query = queryFor(offset, limit);
    if (current.kind === "folder")
      return isUnreadable(current.folderId)
        ? null
        : { url: MEDIA_READS.folderAssets(current.folderId), query };
    if (current.kind === "view")
      return {
        url: MEDIA_READS.smartView(current.view),
        query: { ...query, folderId: scopeFolderId.value },
      };
    if (current.kind === "search")
      return {
        url: MEDIA_READS.search,
        query: {
          ...query,
          q: current.query,
          folderId: current.scopeId ?? scopeFolderId.value,
        },
      };
    return null;
  }

  return { scopeFolderId, listingKey, requestAt };
}
