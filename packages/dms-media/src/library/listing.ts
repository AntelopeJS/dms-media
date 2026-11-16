import { type MediaAsset, MediaAssetModel } from "../db";
import { literalPattern } from "./asset-totals";
import type {
  AssetSortKey,
  PageQuery,
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

function liveAssetsIn(model: AssetsTableModel, folderIds: string[]) {
  return model.table
    .getAll(folderIds.length === 1 ? folderIds[0] : folderIds, "folderId")
    .filter((row) => row.key("isDeleting").default(false).eq(false));
}

/** Every live asset stored in the given folders. */
export async function loadAssetsInFolders(
  model: AssetsTableModel,
  folderIds: string[],
): Promise<MediaAsset[]> {
  if (folderIds.length === 0) return [];
  const rows = await liveAssetsIn(model, folderIds).run();
  return rows
    .map((row) => MediaAssetModel.fromDatabase(row))
    .filter((row): row is MediaAsset => row !== undefined);
}

/**
 * The names of the folder's live assets that hold one of the fragments,
 * ignoring case, filtered in the query. Every name that collides with a
 * fragment's copy names ("photo (2).jpg" for "photo") is among them.
 */
export async function loadNamesContaining(
  model: AssetsTableModel,
  folderId: string,
  fragments: string[],
): Promise<string[]> {
  const matches = await Promise.all(
    namePatterns(fragments).map((pattern) =>
      liveAssetsIn(model, [folderId])
        .filter((row) => row.key("name").match(pattern))
        .pluck("name")
        .run(),
    ),
  );
  return [...new Set(matches.flat().map((row) => row.name))];
}

/** Keeps each pattern well under the length MongoDB accepts for a regular expression. */
const MAX_PATTERN_LENGTH = 4000;

/** Case-insensitive patterns that together match a name holding any of the fragments. */
function namePatterns(fragments: string[]): string[] {
  const patterns: string[][] = [];
  let length = 0;
  for (const fragment of new Set(fragments.map(literalPattern))) {
    const current = patterns.at(-1);
    if (!current || length + fragment.length > MAX_PATTERN_LENGTH) {
      patterns.push([fragment]);
      length = fragment.length;
    } else {
      current.push(fragment);
      length += fragment.length + 1;
    }
  }
  return patterns.map((alternatives) => `(?i)${alternatives.join("|")}`);
}

/** The newest live assets of the given folders, sorted and cut in the query. */
export async function loadNewestAssets(
  model: AssetsTableModel,
  folderIds: string[],
  limit: number,
): Promise<MediaAsset[]> {
  if (folderIds.length === 0) return [];
  const rows = await liveAssetsIn(model, folderIds)
    .orderBy("createdAt", "desc")
    .slice(0, limit)
    .run();
  return rows
    .map((row) => MediaAssetModel.fromDatabase(row))
    .filter((row): row is MediaAsset => row !== undefined);
}

/** Bytes the tenant's live assets keep in storage, edited originals included. */
export async function sumStoredBytes(model: AssetsTableModel): Promise<number> {
  const total = await model.table
    .filter((row) => row.key("isDeleting").default(false).eq(false))
    .map((row) => row.key("size").add(row.key("originalSize").default(0)))
    .sum()
    .run();
  return total ?? 0;
}

function sortAssets(
  assets: MediaAsset[],
  sort: AssetSortKey,
  direction: SortDirection,
): MediaAsset[] {
  const compare = ASSET_COMPARATORS[sort];
  const factor = DIRECTION_FACTORS[direction];
  return [...assets].sort((left, right) => compare(left, right) * factor);
}

function filterByTypeGroup(
  assets: MediaAsset[],
  type: AssetTypeGroup | undefined,
): MediaAsset[] {
  if (!type) return assets;
  return assets.filter((asset) => resolveTypeGroup(asset.mimetype) === type);
}

export function pageAssets(assets: MediaAsset[], query: PageQuery): AssetPage {
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
