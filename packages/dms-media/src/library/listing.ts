import { type MediaAsset, MediaAssetModel } from "../db";
import type {
  AssetSortKey,
  ListingQuery,
  SortDirection,
} from "../validation/library.schema";
import { type AssetTypeGroup, resolveTypeGroup } from "./type-groups";

export interface AssetPage {
  assets: MediaAsset[];
  total: number;
}

type AssetComparator = (left: MediaAsset, right: MediaAsset) => number;

const NAME_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

const ASSET_COMPARATORS: Record<AssetSortKey, AssetComparator> = {
  name: (left, right) => NAME_COLLATOR.compare(left.name, right.name),
  date: (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  size: (left, right) => left.size - right.size,
  type: (left, right) =>
    NAME_COLLATOR.compare(left.mimetype, right.mimetype) ||
    NAME_COLLATOR.compare(left.name, right.name),
};

const DIRECTION_FACTORS: Record<SortDirection, number> = { asc: 1, desc: -1 };

interface AssetsTableModel {
  table: MediaAssetModel["table"];
}

/** Every live asset stored in the given folders. */
export async function loadAssetsInFolders(
  model: AssetsTableModel,
  folderIds: string[],
): Promise<MediaAsset[]> {
  if (folderIds.length === 0) return [];
  const rows = await model.table
    .getAll(folderIds.length === 1 ? folderIds[0] : folderIds, "folderId")
    .filter((row) => row.key("isDeleting").default(false).eq(false))
    .run();
  return rows
    .map((row) => MediaAssetModel.fromDatabase(row))
    .filter((row): row is MediaAsset => row !== undefined);
}

export function sortAssets(
  assets: MediaAsset[],
  sort: AssetSortKey,
  direction: SortDirection,
): MediaAsset[] {
  const compare = ASSET_COMPARATORS[sort];
  const factor = DIRECTION_FACTORS[direction];
  return [...assets].sort((left, right) => compare(left, right) * factor);
}

export function filterByTypeGroup(
  assets: MediaAsset[],
  type: AssetTypeGroup | undefined,
): MediaAsset[] {
  if (!type) return assets;
  return assets.filter((asset) => resolveTypeGroup(asset.mimetype) === type);
}

export function pageAssets(
  assets: MediaAsset[],
  query: ListingQuery,
): AssetPage {
  const filtered = filterByTypeGroup(assets, query.type);
  const sorted = sortAssets(filtered, query.sort, query.direction);
  return {
    assets: sorted.slice(query.offset, query.offset + query.limit),
    total: filtered.length,
  };
}

export type TypeGroupCounts = Record<AssetTypeGroup, number>;

function emptyTypeGroupCounts(): TypeGroupCounts {
  return {
    image: 0,
    video: 0,
    audio: 0,
    pdf: 0,
    document: 0,
    spreadsheet: 0,
    vector: 0,
    archive: 0,
    other: 0,
  };
}

export function countByTypeGroup(assets: MediaAsset[]): TypeGroupCounts {
  const counts = emptyTypeGroupCounts();
  for (const asset of assets) counts[resolveTypeGroup(asset.mimetype)] += 1;
  return counts;
}

export function sumSizeByTypeGroup(assets: MediaAsset[]): TypeGroupCounts {
  const sizes = emptyTypeGroupCounts();
  for (const asset of assets)
    sizes[resolveTypeGroup(asset.mimetype)] += asset.size;
  return sizes;
}
