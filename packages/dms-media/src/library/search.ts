import type { MediaAsset, MediaFolder } from "../db";
import type { ModifiedWindow, SearchQuery } from "../validation/library.schema";
import type { FolderVisibility } from "../types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;

export type SearchMatch = "name" | "alt";

export interface AssetSearchHit {
  asset: MediaAsset;
  matchedOn: SearchMatch;
}

type ModifiedSince = (now: Date) => Date | undefined;

const MODIFIED_SINCE: Record<ModifiedWindow, ModifiedSince> = {
  any: () => undefined,
  "7d": (now) => new Date(now.getTime() - WEEK_DAYS * MS_PER_DAY),
  "30d": (now) => new Date(now.getTime() - MONTH_DAYS * MS_PER_DAY),
  year: (now) => new Date(now.getFullYear(), 0, 1),
};

export function matchAsset(
  asset: MediaAsset,
  term: string,
): SearchMatch | undefined {
  if (term.length === 0) return "name";
  if (asset.name.toLowerCase().includes(term)) return "name";
  if (asset.alt?.toLowerCase().includes(term)) return "alt";
  return undefined;
}

export interface SearchFilterContext {
  query: SearchQuery;
  now: Date;
  visibilityOf: (asset: MediaAsset) => FolderVisibility;
}

/** Applies the term, visibility and modified filters; the type facet stays open. */
export function searchAssets(
  assets: MediaAsset[],
  filter: SearchFilterContext,
): AssetSearchHit[] {
  const term = filter.query.q.toLowerCase();
  const since = MODIFIED_SINCE[filter.query.modified](filter.now);
  const visibility = filter.query.visibility;
  const hits: AssetSearchHit[] = [];
  for (const asset of assets) {
    if (since && asset.updatedAt < since) continue;
    if (visibility !== "any" && filter.visibilityOf(asset) !== visibility)
      continue;
    const matchedOn = matchAsset(asset, term);
    if (matchedOn) hits.push({ asset, matchedOn });
  }
  return hits;
}

export function searchFolders(
  folders: MediaFolder[],
  term: string,
): MediaFolder[] {
  const normalized = term.toLowerCase();
  if (normalized.length === 0) return [];
  return folders.filter((folder) =>
    folder.name.toLowerCase().includes(normalized),
  );
}
