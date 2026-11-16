import type { MediaAsset, MediaFolder } from "../db";

export type SearchMatch = "name" | "alt";

export interface AssetSearchHit<T> {
  asset: T;
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
  asset: Pick<MediaAsset, "name" | "alt">,
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

/**
 * The assets matching the term, in input order. `folderPathOf` names the
 * asset's folder and its ancestors, searched with its name.
 */
export function searchAssets<T extends Pick<MediaAsset, "name" | "alt">>(
  assets: T[],
  term: string,
  folderPathOf: (asset: T) => string = () => "",
): AssetSearchHit<T>[] {
  const words = searchWords(term);
  const hits: AssetSearchHit<T>[] = [];
  for (const asset of assets) {
    const matchedOn = matchAsset(asset, words, folderPathOf(asset));
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
