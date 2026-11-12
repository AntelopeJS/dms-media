import type { MediaAsset } from "../../db";
import { isObject, isString } from "../../guards";

function isStringMap(value: unknown): value is Record<string, string> {
  return (
    isObject(value) &&
    !Array.isArray(value) &&
    Object.values(value).every(isString)
  );
}

export function parseDerivatives(asset: MediaAsset): Record<string, string> {
  if (!asset.json_derivatives) return {};
  const parsed: unknown = JSON.parse(asset.json_derivatives);
  if (isStringMap(parsed)) return parsed;
  throw new Error(
    `Media asset '${asset._id}' has image sizes that are not a map of storage keys`,
  );
}

export function collectAssetStorageKeys(asset: MediaAsset): string[] {
  const keys = new Set<string>([asset.storageKey]);
  if (asset.originalKey) keys.add(asset.originalKey);
  for (const derivativeKey of Object.values(parseDerivatives(asset))) {
    keys.add(derivativeKey);
  }
  return [...keys];
}
