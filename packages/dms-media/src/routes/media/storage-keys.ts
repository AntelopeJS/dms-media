import type { MediaAsset } from "../../db";

export function parseDerivatives(asset: MediaAsset): Record<string, string> {
  if (!asset.json_derivatives) return {};
  // SAFETY: json_derivatives is written only as "" or the JSON.stringify of a map from cache key to storage key (transform.ts, derivatives.ts, crons/sweep-derivatives.ts), so a non-empty value is that string map; a schema parse of a stored row on read is excluded by ruling.
  return JSON.parse(asset.json_derivatives) as Record<string, string>;
}

export function collectAssetStorageKeys(asset: MediaAsset): string[] {
  const keys = new Set<string>([asset.storageKey]);
  if (asset.originalKey) keys.add(asset.originalKey);
  for (const derivativeKey of Object.values(parseDerivatives(asset))) {
    keys.add(derivativeKey);
  }
  return [...keys];
}
