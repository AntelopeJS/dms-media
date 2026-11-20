import { getMediaConfig } from "../config";
import type { MediaAsset, MediaFolder } from "../db";
import { loadMimetypeTotals, totalsByTypeGroup } from "../library/asset-totals";
import {
  loadAssetsById,
  loadSortFields,
  pageAssets,
  sumStoredBytes,
} from "../library/listing";
import { searchAssets, type SearchMatch, searchWords } from "../library/search";
import type { AssetTypeGroup } from "../library/type-groups";
import {
  getDescendantFolders,
  type MediaRequestContext,
} from "../routes/media/context";
import type { PageQuery } from "../validation/library.schema";

/** One page of files and how many match across every page. */
export interface FilePage {
  assets: MediaAsset[];
  total: number;
}

export interface SearchPage extends FilePage {
  matchedOn: Map<string, SearchMatch>;
}

/** What a search asks: words, optionally a type, one page. */
export interface SearchQuery {
  q: string;
  type?: AssetTypeGroup;
  limit: number;
  offset: number;
}

type TypeGroupUsage = {
  group: AssetTypeGroup;
  files: number;
  bytes: number;
};

export interface StorageUsage {
  usedBytes: number;
  fileCount: number;
  quotaBytes: number | null;
  byType: TypeGroupUsage[];
}

const PERCENT = 100;
const ONE_DECIMAL = 10;

/** Folder names from the root down to `folder`, as searches read them. */
export function folderPathName(
  context: Pick<MediaRequestContext, "foldersById">,
  folder: MediaFolder | undefined,
): string {
  if (!folder) return "";
  return [...folder.path, folder._id]
    .map((id) => context.foldersById.get(id)?.name ?? "")
    .join(" ");
}

/** A folder and, when asked, every folder below it. */
export function folderScope(
  context: MediaRequestContext,
  folderId: string,
  includeSubfolders: boolean,
): string[] {
  if (!includeSubfolders) return [folderId];
  return [
    folderId,
    ...getDescendantFolders(context, folderId).map((folder) => folder._id),
  ];
}

async function loadPage(
  context: MediaRequestContext,
  rows: MediaAsset["_id"][],
): Promise<MediaAsset[]> {
  return loadAssetsById(context.assetModel, rows);
}

/** One page of the live files of `scope`, sorted and filtered on type. */
export async function listFiles(
  context: MediaRequestContext,
  scope: string[],
  query: PageQuery,
): Promise<FilePage> {
  const rows = await loadSortFields(context.assetModel, scope, []);
  const page = pageAssets(rows, query);
  return {
    assets: await loadPage(
      context,
      page.assets.map((row) => row._id),
    ),
    total: page.total,
  };
}

/**
 * One page of the live files of `scope` whose name, folder path or alt text
 * hold every word, ignoring case and accents, sorted by name.
 */
export async function searchFiles(
  context: MediaRequestContext,
  scope: string[],
  query: SearchQuery,
): Promise<SearchPage> {
  if (searchWords(query.q).length === 0)
    return { assets: [], total: 0, matchedOn: new Map() };
  const rows = await loadSortFields(context.assetModel, scope, []);
  const hits = searchAssets(rows, query.q, (row) =>
    folderPathName(context, context.foldersById.get(row.folderId)),
  );
  const page = pageAssets(
    hits.map((hit) => hit.asset),
    { ...query, sort: "name", direction: "asc" },
  );
  return {
    assets: await loadPage(
      context,
      page.assets.map((row) => row._id),
    ),
    total: page.total,
    matchedOn: new Map(hits.map((hit) => [hit.asset._id, hit.matchedOn])),
  };
}

/** Bytes the tenant's library keeps, against its storage plan, by type of file. */
export async function readStorageUsage(
  context: MediaRequestContext,
): Promise<StorageUsage> {
  const [usedBytes, totals] = await Promise.all([
    sumStoredBytes(context.assetModel),
    loadMimetypeTotals(
      context.assetModel,
      context.folders.map((folder) => folder._id),
    ),
  ]);
  const byType = [...totalsByTypeGroup(totals)].map(([group, total]) => ({
    group,
    files: total.files,
    bytes: total.size,
  }));
  return {
    usedBytes,
    fileCount: byType.reduce((sum, row) => sum + row.files, 0),
    quotaBytes: getMediaConfig().storageQuotaBytes ?? null,
    byType,
  };
}

/** Usage as a percentage of the plan, one decimal. */
export function usedPercent(usedBytes: number, quotaBytes: number): number {
  return (
    Math.round(((usedBytes * PERCENT) / quotaBytes) * ONE_DECIMAL) / ONE_DECIMAL
  );
}
