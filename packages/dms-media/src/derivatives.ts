import { randomUUID } from "node:crypto";
import {
  CreateReadUrl,
  CreateUploadUrl,
  DeleteFile,
} from "@antelopejs/interface-file-storage";
import sharp from "sharp";
import { updateAssetMedia } from "./asset-lifecycle";
import { ORIGINAL_FILENAME_METADATA_KEY } from "./constants";
import type { MediaAsset, MediaAssetModel } from "./db";
import {
  type MediaPresetConfig,
  presetCacheKey,
  presetMimetype,
  RASTERIZED_SVG_FORMAT,
  SVG_MIMETYPE,
} from "./presets";
import { parseDerivatives } from "./routes/media/storage-keys";

const DERIVATIVES_PATH_PREFIX = "media-derivatives";
const GENERATION_FAILURE_RETRY_MS = 60_000;

const generationLocks = new Map<string, Promise<string>>();
const generationFailures = new Map<string, number>();

export async function downloadStorageBytes(
  storageKey: string,
  storage: string | undefined,
): Promise<Buffer> {
  const readUrl = await CreateReadUrl(storageKey, undefined, storage);
  const response = await fetch(readUrl.url);
  if (!response.ok) {
    throw new Error(`Failed to download ${storageKey}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function uploadStorageBytes(
  bytes: Buffer,
  filename: string,
  mimetype: string,
  path: string,
  storage: string | undefined,
): Promise<string> {
  const presigned = await CreateUploadUrl(
    {
      filename,
      size: bytes.byteLength,
      mimetype,
      path,
      metadata: { [ORIGINAL_FILENAME_METADATA_KEY]: filename },
    },
    undefined,
    storage,
  );
  const response = await fetch(presigned.uploadUrl, {
    method: "PUT",
    headers: presigned.headers,
    body: new Uint8Array(bytes),
  });
  if (!response.ok) {
    throw new Error(`Failed to upload ${filename}: ${response.status}`);
  }
  return presigned.resourceKey;
}

export async function transformImage(
  source: Buffer,
  preset: MediaPresetConfig,
): Promise<Buffer> {
  let pipeline = sharp(source);
  if (preset.width || preset.height) {
    pipeline = pipeline.resize({
      width: preset.width,
      height: preset.height,
      fit: preset.fit ?? "cover",
      withoutEnlargement: true,
    });
  }
  if (preset.format) {
    pipeline = pipeline.toFormat(preset.format, {
      quality: preset.quality,
    });
  }
  return pipeline.toBuffer();
}

function derivativeExtension(
  asset: MediaAsset,
  preset: MediaPresetConfig,
): string {
  if (preset.format) return preset.format;
  if (asset.mimetype === SVG_MIMETYPE) return RASTERIZED_SVG_FORMAT;
  return asset.name.split(".").pop() ?? "bin";
}

function derivativeFilename(
  asset: MediaAsset,
  preset: MediaPresetConfig,
  cacheKey: string,
): string {
  const baseName = asset.name.replace(/\.[^.]+$/, "");
  return `${baseName}.${cacheKey}.${derivativeExtension(asset, preset)}`;
}

async function generateDerivative(
  assetModel: MediaAssetModel,
  asset: MediaAsset,
  preset: MediaPresetConfig,
  cacheKey: string,
): Promise<string> {
  const source = await downloadStorageBytes(asset.storageKey, asset.storage);
  const output = await transformImage(source, preset);
  const storageKey = await uploadStorageBytes(
    output,
    derivativeFilename(asset, preset, cacheKey),
    presetMimetype(preset, asset.mimetype),
    `${DERIVATIVES_PATH_PREFIX}/${asset._id}/${randomUUID()}`,
    asset.storage,
  );
  const committed = await commitDerivative(
    assetModel,
    asset,
    cacheKey,
    storageKey,
  );
  if (committed !== undefined) return committed;
  const fresh = await assetModel.get(asset._id);
  if (!fresh || fresh.isDeleting) throw new Error("Media asset was deleted");
  return generateDerivative(assetModel, fresh, preset, cacheKey);
}

/** Publishes a new immutable file only while its source asset is still current. */
export async function commitDerivative(
  assetModel: MediaAssetModel,
  asset: MediaAsset,
  cacheKey: string,
  storageKey: string,
): Promise<string | undefined> {
  for (;;) {
    const fresh = await assetModel.get(asset._id);
    if (!fresh || fresh.isDeleting || fresh.storageKey !== asset.storageKey) {
      await DeleteFile(storageKey, asset.storage).catch(() => undefined);
      return undefined;
    }
    const derivatives = parseDerivatives(fresh);
    if (derivatives[cacheKey] === storageKey) return storageKey;
    if (derivatives[cacheKey]) {
      await DeleteFile(storageKey, asset.storage).catch(() => undefined);
      return derivatives[cacheKey];
    }
    if (
      await updateAssetMedia(assetModel, fresh, {
        json_derivatives: JSON.stringify({
          ...derivatives,
          [cacheKey]: storageKey,
        }),
      })
    )
      return storageKey;
  }
}

export interface DerivativePartition {
  fresh: Record<string, string>;
  stale: Record<string, string>;
}

export function partitionDerivatives(
  derivatives: Record<string, string>,
  presets: Iterable<MediaPresetConfig>,
): DerivativePartition {
  const validCacheKeys = new Set([...presets].map(presetCacheKey));
  const fresh: Record<string, string> = {};
  const stale: Record<string, string> = {};
  for (const [cacheKey, storageKey] of Object.entries(derivatives)) {
    if (validCacheKeys.has(cacheKey)) {
      fresh[cacheKey] = storageKey;
    } else {
      stale[cacheKey] = storageKey;
    }
  }
  return { fresh, stale };
}

function pruneExpiredGenerationFailures(now: number): void {
  for (const [lockKey, failedAt] of generationFailures) {
    if (now - failedAt >= GENERATION_FAILURE_RETRY_MS) {
      generationFailures.delete(lockKey);
    }
  }
}

function assertNoRecentGenerationFailure(lockKey: string): void {
  pruneExpiredGenerationFailures(Date.now());
  if (!generationFailures.has(lockKey)) return;
  throw new Error(`Derivative generation for ${lockKey} recently failed`);
}

export async function ensureDerivative(
  assetModel: MediaAssetModel,
  asset: MediaAsset,
  preset: MediaPresetConfig,
): Promise<string> {
  const fresh = await assetModel.get(asset._id);
  if (!fresh || fresh.isDeleting) throw new Error("Media asset was deleted");
  asset = fresh;
  const cacheKey = presetCacheKey(preset);
  const existing = parseDerivatives(asset)[cacheKey];
  if (existing) return existing;
  const lockKey = `${asset._id}:${asset.storage ?? ""}:${asset.storageKey}:${cacheKey}`;
  assertNoRecentGenerationFailure(lockKey);
  const pending = generationLocks.get(lockKey);
  if (pending) return pending;
  const generation = generateDerivative(assetModel, asset, preset, cacheKey)
    .then((storageKey) => {
      generationFailures.delete(lockKey);
      return storageKey;
    })
    .catch((error: unknown) => {
      generationFailures.set(lockKey, Date.now());
      throw error;
    })
    .finally(() => generationLocks.delete(lockKey));
  generationLocks.set(lockKey, generation);
  return generation;
}
