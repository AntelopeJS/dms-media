import { type ValueProxy } from "@antelopejs/interface-database";
import { type MediaAsset, MediaAssetModel } from "../db";
import { literalPattern } from "./asset-totals";
import type {
  AssetSortKey,
  PageQuery,
  SortDirection,
} from "../validation/library.schema";
import { type AssetPredicate, isOneOf } from "./asset-filters";
import { type AssetTypeGroup, resolveTypeGroup } from "./type-groups";

/** The fields the library sorts, searches and counts facets on. */
export type AssetSortFields = Pick<
  MediaAsset,
  "_id" | "folderId" | "name" | "alt" | "mimetype" | "createdAt" | "size"
>;

export interface AssetPage<T extends AssetSortFields> {
  assets: T[];
  total: number;
}

type AssetComparator = (
  left: AssetSortFields,
  right: AssetSortFields,
) => number;

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

function liveAssetsIn(
  model: AssetsTableModel,
  folderIds: string[],
  where: AssetPredicate[] = [],
) {
  return model.table
    .getAll(folderIds.length === 1 ? folderIds[0] : folderIds, "folderId")
    .filter((row) =>
      where.reduce<ValueProxy<boolean>>(
        (condition, predicate) => condition.and(predicate(row)),
        row.key("isDeleting").default(false).eq(false),
      ),
    );
}

/** The sort fields of every live asset of the folders that meets `where`, in stored order. */
export async function loadSortFields(
  model: AssetsTableModel,
  folderIds: string[],
  where: AssetPredicate[],
): Promise<AssetSortFields[]> {
  if (folderIds.length === 0) return [];
  return liveAssetsIn(model, folderIds, where)
    .pluck("_id", "folderId", "name", "alt", "mimetype", "createdAt", "size")
    .run();
}

/** How many live assets of the folders that meet `where` have each stored mimetype. */
export async function countMimetypes(
  model: AssetsTableModel,
  folderIds: string[],
  where: AssetPredicate[],
): Promise<Map<string, number>> {
  if (folderIds.length === 0) return new Map();
  const groups = await liveAssetsIn(model, folderIds, where)
    .group("mimetype", (stream, mimetype) => ({
      mimetype,
      count: stream.count(),
    }))
    .run();
  return new Map(groups.map((group) => [group.mimetype, group.count]));
}

/** Assets whose stored mimetype files them under `type`. */
export function typeGroupPredicate(
  type: AssetTypeGroup,
  mimetypes: Iterable<string>,
): AssetPredicate {
  const inGroup = [...mimetypes].filter(
    (mimetype) => resolveTypeGroup(mimetype) === type,
  );
  return (row) => isOneOf(row.key("mimetype"), inGroup);
}

/** The live assets with these ids, in the order of `ids`. */
export async function loadAssetsById(
  model: AssetsTableModel,
  ids: string[],
): Promise<MediaAsset[]> {
  if (ids.length === 0) return [];
  const rows = await model.table
    .getAll(ids)
    .filter((row) => row.key("isDeleting").default(false).eq(false))
    .run();
  const byId = new Map(
    rows
      .map((row) => MediaAssetModel.fromDatabase(row))
      .filter((row): row is MediaAsset => row !== undefined)
      .map((row) => [row._id, row]),
  );
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is MediaAsset => row !== undefined);
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

function sortAssets<T extends AssetSortFields>(
  assets: T[],
  sort: AssetSortKey,
  direction: SortDirection,
): T[] {
  const compare = ASSET_COMPARATORS[sort];
  const factor = DIRECTION_FACTORS[direction];
  return [...assets].sort((left, right) => compare(left, right) * factor);
}

function filterByTypeGroup<T extends Pick<MediaAsset, "mimetype">>(
  assets: T[],
  type: AssetTypeGroup | undefined,
): T[] {
  if (!type) return assets;
  return assets.filter((asset) => resolveTypeGroup(asset.mimetype) === type);
}

/** Filters on the type group, sorts with ties kept in input order, and cuts one page. */
export function pageAssets<T extends AssetSortFields>(
  assets: T[],
  query: PageQuery,
): AssetPage<T> {
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

/** Facet counts from the number of assets of each mimetype. */
export function countTypeGroups(
  mimetypeCounts: Iterable<[string, number]>,
): TypeGroupCounts {
  const counts = emptyTypeGroupCounts();
  for (const [mimetype, count] of mimetypeCounts)
    counts[resolveTypeGroup(mimetype)] += count;
  return counts;
}

export function countByTypeGroup(
  assets: Pick<MediaAsset, "mimetype">[],
): TypeGroupCounts {
  return countTypeGroups(assets.map((asset) => [asset.mimetype, 1]));
}
