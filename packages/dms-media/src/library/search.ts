import type { MediaAsset, MediaFolder } from "../db";
import type {
  AssetFilterQuery,
  SearchQuery,
} from "../validation/library.schema";
import { type AssetFilterContext, filterAssets } from "./asset-filters";

export type SearchMatch = "name" | "alt";

export interface AssetSearchHit {
  asset: MediaAsset;
  matchedOn: SearchMatch;
}

const COMBINING_MARKS = /\p{M}+/gu;
const WORD_SEPARATORS = /[^\p{L}\p{N}]+/gu;

/** Lowercase, accent-free text with every punctuation run turned into one space. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(WORD_SEPARATORS, " ")
    .trim();
}

/** The words of a search term, each to be found somewhere in what is searched. */
export function searchWords(term: string): string[] {
  const normalized = normalizeSearchText(term);
  return normalized ? normalized.split(" ") : [];
}

function containsEvery(haystack: string, words: string[]): boolean {
  return words.every((word) => haystack.includes(word));
}

/**
 * Where an asset matches: every word must appear in its name, its folder path
 * or its alt text, and at least one in the name or the alt text, so a folder
 * name narrows a search without listing the whole folder. Accents, case and
 * punctuation are ignored.
 */
export function matchAsset(
  asset: MediaAsset,
  words: string[],
  folderPath = "",
): SearchMatch | undefined {
  if (words.length === 0) return "name";
  const name = normalizeSearchText(asset.name);
  const path = normalizeSearchText(folderPath);
  const alt = normalizeSearchText(asset.alt ?? "");
  const own = `${name} ${alt}`;
  if (!containsEvery(`${own} ${path}`, words)) return undefined;
  if (!words.some((word) => own.includes(word))) return undefined;
  return containsEvery(`${name} ${path}`, words) ? "name" : "alt";
}

export interface SearchFilterContext extends AssetFilterContext {
  query: AssetFilterQuery & Partial<SearchQuery> & { q: string };
  /** Names of the asset's folder and its ancestors, searched with its name. */
  folderPathOf?: (asset: MediaAsset) => string;
}

/** Applies the facet filters then the term; the type facet stays open. */
export function searchAssets(
  assets: MediaAsset[],
  filter: SearchFilterContext,
): AssetSearchHit[] {
  const words = searchWords(filter.query.q);
  const hits: AssetSearchHit[] = [];
  for (const asset of filterAssets(assets, filter)) {
    const matchedOn = matchAsset(asset, words, filter.folderPathOf?.(asset));
    if (matchedOn) hits.push({ asset, matchedOn });
  }
  return hits;
}

export function searchFolders(
  folders: MediaFolder[],
  term: string,
): MediaFolder[] {
  const words = searchWords(term);
  if (words.length === 0) return [];
  return folders.filter((folder) =>
    containsEvery(normalizeSearchText(folder.name), words),
  );
}
