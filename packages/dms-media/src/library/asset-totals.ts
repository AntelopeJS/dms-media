import { ValueProxy } from "@antelopejs/interface-database";
import type { MediaAsset, MediaAssetModel, MediaFolder } from "../db";
import type { AssetVisibility } from "../types";
import { type AssetTypeGroup, resolveTypeGroup } from "./type-groups";

interface AssetsTableModel {
  table: MediaAssetModel["table"];
}

/** Characters `String.prototype.trim` removes, as a regular expression class body. */
const TRIMMED_CHARACTERS =
  "\\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

/** Matches a text that keeps a character once trimmed. */
const VISIBLE_TEXT = `[^${TRIMMED_CHARACTERS}]`;

/** Matches the mimetype of an image alt text describes, vectors included. */
const DESCRIBABLE_MIMETYPE = "^image/";

const BYTES_PER_MEGABYTE = 1000 * 1000;
const LARGE_FILE_MEGABYTES = 20;

/** Above this size the overview lists a file as heavy. */
export const LARGE_FILE_BYTES = LARGE_FILE_MEGABYTES * BYTES_PER_MEGABYTE;

/** The live assets of one folder that a query kept, counted and summed by the database. */
export interface FolderCount {
  folderId: string;
  files: number;
  /** Bytes of the current files. */
  size: number;
  /** Bytes of the originals that edits keep. */
  originalSize: number;
}

/** The live assets of one mimetype, counted and summed by the database. */
export interface MimetypeTotals {
  mimetype: string;
  files: number;
  /** Bytes kept in storage, originals included. */
  storedSize: number;
}

type AssetRow = ValueProxy<MediaAsset>;

function liveAssetsIn(model: AssetsTableModel, folderIds: string[]) {
  return model.table
    .getAll(folderIds.length === 1 ? folderIds[0] : folderIds, "folderId")
    .filter((row) => row.key("isDeleting").default(false).eq(false));
}

function isMissingAlt(row: AssetRow) {
  return row
    .key("mimetype")
    .downcase()
    .match(DESCRIBABLE_MIMETYPE)
    .and(row.key("alt").default("").match(VISIBLE_TEXT).not());
}

function hasOwnVisibility(row: AssetRow, visibility: AssetVisibility) {
  return row.key("visibility").eq(visibility);
}

/** Every subset of a folder's live assets the library counts apart; the overview reads them all. */
export const LIBRARY_SUBSETS = [
  "ownPublic",
  "inherited",
  "missingAlt",
  "missingAltOwnPublic",
  "missingAltInherited",
  "createdSince",
  "large",
] as const;

export type FolderSubset = (typeof LIBRARY_SUBSETS)[number];

/**
 * Whether a row belongs to the subset. The provider runs a filter inside a
 * group before grouping, so each subset is a query of its own.
 */
function inSubset(
  subset: FolderSubset,
  row: AssetRow,
  since: Date,
): ValueProxy<boolean> {
  switch (subset) {
    case "ownPublic":
      return hasOwnVisibility(row, "public");
    case "inherited":
      return hasOwnVisibility(row, "inherit");
    case "missingAlt":
      return isMissingAlt(row);
    case "missingAltOwnPublic":
      return isMissingAlt(row).and(hasOwnVisibility(row, "public"));
    case "missingAltInherited":
      return isMissingAlt(row).and(hasOwnVisibility(row, "inherit"));
    case "createdSince":
      return row.key("createdAt").ge(since);
    case "large":
      return row.key("size").gt(LARGE_FILE_BYTES);
  }
}

/** One row per folder holding a live asset: for every live asset, and for each subset that was asked for. */
export interface FolderCounts {
  all: FolderCount[];
  subsets: Partial<Record<FolderSubset, FolderCount[]>>;
}

async function countPerFolder(
  model: AssetsTableModel,
  folderIds: string[],
  keep?: (row: AssetRow) => ValueProxy<boolean>,
): Promise<FolderCount[]> {
  const live = liveAssetsIn(model, folderIds);
  return (keep ? live.filter(keep) : live)
    .group("folderId", (assets, folderId) => ({
      folderId,
      files: assets.count(),
      size: assets.sum("size"),
      originalSize: assets.sum("originalSize"),
    }))
    .run();
}

/** Counts and sums the live assets of each folder in the query, for every live asset and for each subset asked for. */
export async function loadFolderCounts(
  model: AssetsTableModel,
  folderIds: string[],
  subsets: readonly FolderSubset[] = [],
  since: Date = new Date(0),
): Promise<FolderCounts> {
  if (folderIds.length === 0) return { all: [], subsets: {} };
  const [all, ...kept] = await Promise.all([
    countPerFolder(model, folderIds),
    ...subsets.map((subset) =>
      countPerFolder(model, folderIds, (row) => inSubset(subset, row, since)),
    ),
  ]);
  return {
    all: all ?? [],
    subsets: Object.fromEntries(
      subsets.map((subset, index) => [subset, kept[index] ?? []]),
    ),
  };
}

/** The rows of one subset; none when it was not asked for. */
export function subsetRows(
  counts: FolderCounts,
  subset: FolderSubset,
): FolderCount[] {
  return counts.subsets[subset] ?? [];
}

/** One row per mimetype of the live assets, counted and summed in the query. */
export async function loadMimetypeTotals(
  model: AssetsTableModel,
  folderIds: string[],
): Promise<MimetypeTotals[]> {
  if (folderIds.length === 0) return [];
  return liveAssetsIn(model, folderIds)
    .group("mimetype", (assets, mimetype) => ({
      mimetype,
      files: assets.count(),
      storedSize: assets
        .map((row) => row.key("size").add(row.key("originalSize").default(0)))
        .sum(),
    }))
    .run();
}

/** How many of the given assets are live in the given folders, counted in the query. */
export async function countLiveAssets(
  model: AssetsTableModel,
  assetIds: string[],
  folderIds: string[],
): Promise<number> {
  if (assetIds.length === 0 || folderIds.length === 0) return 0;
  return model.table
    .getAll(assetIds)
    .filter((row) =>
      row
        .key("isDeleting")
        .default(false)
        .eq(false)
        .and(ValueProxy.constant(folderIds).includes(row.key("folderId"))),
    )
    .count()
    .run();
}

/** A pattern that matches `text` literally. */
export function literalPattern(text: string): string {
  return text
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("\u0000", "\\x00");
}

/** How many live assets of the folders hold a rendered image size under each cache key, counted in the query. */
export async function countRenderedSizes(
  model: AssetsTableModel,
  folderIds: string[],
  cacheKeys: string[],
): Promise<Map<string, number>> {
  const counts = await Promise.all(
    cacheKeys.map(async (cacheKey): Promise<[string, number]> => {
      if (folderIds.length === 0) return [cacheKey, 0];
      const keyInMap = `[{,]${literalPattern(JSON.stringify(cacheKey))}:`;
      const count = await liveAssetsIn(model, folderIds)
        .filter((row) =>
          row.key("json_derivatives").default("").match(keyInMap),
        )
        .count()
        .run();
      return [cacheKey, count];
    }),
  );
  return new Map(counts);
}

/** The library's figures, summed from the per-folder rows. */
export interface LibraryTotals {
  files: number;
  size: number;
  /** Bytes kept in storage, originals included. */
  storedSize: number;
  publicFiles: number;
  missingAlt: number;
  publicMissingAlt: number;
  createdSince: number;
  largeFiles: number;
  largeStoredSize: number;
}

/** Files of the rows. */
export function sumFiles(rows: FolderCount[]): number {
  return rows.reduce((total, row) => total + row.files, 0);
}

/** Bytes of the current files of the rows. */
export function sumSize(rows: FolderCount[]): number {
  return rows.reduce((total, row) => total + row.size, 0);
}

function sumStoredSize(rows: FolderCount[]): number {
  return rows.reduce((total, row) => total + row.size + row.originalSize, 0);
}

/** Files that are public, by their own visibility or else by their folder's. */
export function countPublicFiles(
  ownPublic: FolderCount[],
  inherited: FolderCount[],
  foldersById: ReadonlyMap<string, MediaFolder>,
): number {
  return (
    sumFiles(ownPublic) +
    sumFiles(
      inherited.filter(
        (row) => foldersById.get(row.folderId)?.visibility === "public",
      ),
    )
  );
}

/** Adds the folders' rows up, resolving inherited visibility from each folder. */
export function sumLibraryTotals(
  counts: FolderCounts,
  foldersById: ReadonlyMap<string, MediaFolder>,
): LibraryTotals {
  const rows = (subset: FolderSubset) => subsetRows(counts, subset);
  return {
    files: sumFiles(counts.all),
    size: sumSize(counts.all),
    storedSize: sumStoredSize(counts.all),
    publicFiles: countPublicFiles(
      rows("ownPublic"),
      rows("inherited"),
      foldersById,
    ),
    missingAlt: sumFiles(rows("missingAlt")),
    publicMissingAlt: countPublicFiles(
      rows("missingAltOwnPublic"),
      rows("missingAltInherited"),
      foldersById,
    ),
    createdSince: sumFiles(rows("createdSince")),
    largeFiles: sumFiles(rows("large")),
    largeStoredSize: sumStoredSize(rows("large")),
  };
}

export interface TypeGroupTotal {
  files: number;
  size: number;
}

/** Files and stored bytes per kind of file, from the per-mimetype rows. */
export function totalsByTypeGroup(
  rows: MimetypeTotals[],
): Map<AssetTypeGroup, TypeGroupTotal> {
  const totals = new Map<AssetTypeGroup, TypeGroupTotal>();
  for (const row of rows) {
    const group = resolveTypeGroup(row.mimetype);
    const total = totals.get(group) ?? { files: 0, size: 0 };
    totals.set(group, {
      files: total.files + row.files,
      size: total.size + row.storedSize,
    });
  }
  return totals;
}
