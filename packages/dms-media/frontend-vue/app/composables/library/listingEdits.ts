import type { ComputedRef, Ref } from "vue";
import type {
  AssetPage,
  AssetSortKey,
  MediaAsset,
  SortDirection,
} from "../../types/media";
import type { ListingSort } from "../useMediaPrefs";
import type { ListingFilters } from "./useLibraryListing";

/** A page of the listing, with the size it was asked for: a revalidation asks for the same. */
export interface ListingPage extends AssetPage {
  limit: number;
}

type AssetComparator = (left: MediaAsset, right: MediaAsset) => number;

const COMPARATORS: Record<AssetSortKey, AssetComparator> = {
  name: (left, right) => NAME_COLLATOR.compare(left.name, right.name),
  date: (left, right) =>
    Date.parse(left.createdAt) - Date.parse(right.createdAt),
  size: (left, right) => left.size - right.size,
  type: (left, right) =>
    NAME_COLLATOR.compare(left.mimetype, right.mimetype) ||
    NAME_COLLATOR.compare(left.name, right.name),
};
const DIRECTION_FACTORS: Record<SortDirection, number> = { asc: 1, desc: -1 };

/** Where `asset` belongs among `assets` already in the listing's order. */
function sortedIndex(
  assets: MediaAsset[],
  asset: MediaAsset,
  sort: ListingSort,
): number {
  const compare = COMPARATORS[sort.sort];
  const factor = DIRECTION_FACTORS[sort.direction];
  const index = assets.findIndex((entry) => compare(asset, entry) * factor < 0);
  return index < 0 ? assets.length : index;
}

function loadedCount(pages: ListingPage[]): number {
  return pages.reduce((count, page) => count + page.assets.length, 0);
}

/** Where the page after `pages` starts, or `null` once every file is loaded. */
export function nextOffset(pages: ListingPage[]): number | null {
  const last = pages.at(-1);
  const loaded = loadedCount(pages);
  return last && loaded < last.total ? loaded : null;
}

/** Spreads `assets` over pages of the sizes `pages` hold, the last one taking the rest. */
function spreadOver(pages: ListingPage[], assets: MediaAsset[]): ListingPage[] {
  let start = 0;
  return pages.map((page, index) => {
    const end =
      index === pages.length - 1 ? assets.length : start + page.assets.length;
    const slice = assets.slice(start, end);
    start = end;
    return { ...page, assets: slice };
  });
}

/** What the edits of the loaded pages read of the listing, and how they put the edited pages back. */
export interface ListingEditsSource {
  pages: ComputedRef<ListingPage[]>;
  assets: ComputedRef<MediaAsset[]>;
  filters: Ref<ListingFilters>;
  hasMore: ComputedRef<boolean>;
  replacePages: (pages: ListingPage[]) => void;
}

/** The changes a write makes to the files on screen, shown before the read that confirms them. */
export function createListingEdits({
  pages,
  assets,
  filters,
  hasMore,
  replacePages,
}: ListingEditsSource) {
  function rewritePages(update: (shown: ListingPage[]) => ListingPage[]): void {
    if (pages.value.length === 0) return;
    replacePages(update(pages.value));
  }

  function patchAsset(assetId: string, changes: Partial<MediaAsset>): void {
    rewritePages((shown) =>
      shown.map((page) => ({
        ...page,
        assets: page.assets.map((asset) =>
          asset.id === assetId ? { ...asset, ...changes } : asset,
        ),
      })),
    );
  }

  function reorderAssets(order: MediaAsset[]): void {
    rewritePages((shown) => spreadOver(shown, order));
  }

  function removeAssets(ids: string[]): void {
    const removed = new Set(ids);
    const count = assets.value.filter((asset) => removed.has(asset.id)).length;
    rewritePages((shown) =>
      shown.map((page) => ({
        ...page,
        assets: page.assets.filter((asset) => !removed.has(asset.id)),
        total: Math.max(page.total - count, 0),
      })),
    );
  }

  function removeExtraFolder(folderId: string): void {
    rewritePages((shown) =>
      shown.map((page) => ({
        ...page,
        folders: page.folders?.filter((folder) => folder.id !== folderId),
      })),
    );
  }

  function insertAsset(asset: MediaAsset): void {
    if (assets.value.some((entry) => entry.id === asset.id)) return;
    if (filters.value.type && asset.typeGroup !== filters.value.type) return;
    const index = sortedIndex(assets.value, asset, filters.value);
    const isBeyondLoaded = index === assets.value.length && hasMore.value;
    const order = isBeyondLoaded
      ? assets.value
      : [...assets.value.slice(0, index), asset, ...assets.value.slice(index)];
    rewritePages((shown) =>
      spreadOver(
        shown.map((page) => ({ ...page, total: page.total + 1 })),
        order,
      ),
    );
  }

  return {
    patchAsset,
    reorderAssets,
    removeAssets,
    removeExtraFolder,
    insertAsset,
  };
}
