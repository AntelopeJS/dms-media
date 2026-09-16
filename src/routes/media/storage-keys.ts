import type { MediaAsset } from "../../db";

export function parseDerivatives(asset: MediaAsset): Record<string, string> {
  if (!asset.json_derivatives) return {};
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
