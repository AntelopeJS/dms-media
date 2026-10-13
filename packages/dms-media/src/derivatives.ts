import { randomUUID } from "node:crypto";
import {
  CreateUploadUrl,
  DeleteFile,
} from "@antelopejs/interface-file-storage";
import sharp from "sharp";
import { TECHNICAL_MUTATION, updateAssetMedia } from "./asset-lifecycle";
import { ORIGINAL_FILENAME_METADATA_KEY } from "./constants";
import { MAX_ANIMATION_FRAMES, MAX_INPUT_PIXELS } from "./image-limits";
import type { MediaAsset, MediaAssetModel } from "./db";
import {
  type MediaPresetConfig,
  presetCacheKey,
  presetMimetype,
  RASTERIZED_SVG_FORMAT,
  SVG_MIMETYPE,
} from "./presets";
import { signedReadUrl } from "./read-urls";
import { parseDerivatives } from "./routes/media/storage-keys";

const DERIVATIVES_PATH_PREFIX = "media-derivatives";
const GENERATION_FAILURE_RETRY_MS = 60_000;
const UNREADABLE_IMAGE_RETRY_MS = 60 * 60_000;
const VECTOR_BASE_DENSITY = 72;
const MAX_VECTOR_DENSITY = 2400;
const SINGLE_FRAME_PAGE_COUNT = 1;
const ANIMATED_OUTPUT_FORMATS = new Set(["webp", "gif"]);

/** The stored bytes of an image asset cannot be decoded. */
export class UnreadableImageError extends Error {}

interface GenerationFailure {
  failedAt: number;
  error: unknown;
}

const generationLocks = new Map<string, Promise<string>>();
const generationFailures = new Map<string, GenerationFailure>();

export async function downloadStorageBytes(
  storageKey: string,
  storage: string | undefined,
): Promise<Buffer> {
  const response = await fetch(await signedReadUrl(storageKey, storage));
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

async function readSourceMetadata(source: Buffer): Promise<sharp.Metadata> {
  try {
    return await sharp(source).metadata();
  } catch (error) {
    throw new UnreadableImageError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

function vectorDensity(
  metadata: sharp.Metadata,
  preset: MediaPresetConfig,
): number | undefined {
  if (metadata.format !== "svg" || !metadata.width || !metadata.height) {
    return undefined;
  }
  const scale = Math.max(
    (preset.width ?? 0) / metadata.width,
    (preset.height ?? 0) / metadata.height,
  );
  if (scale <= 1) return undefined;
  return Math.min(Math.ceil(VECTOR_BASE_DENSITY * scale), MAX_VECTOR_DENSITY);
}

function keepsAnimation(
  metadata: sharp.Metadata,
  preset: MediaPresetConfig,
): boolean {
  const pages = metadata.pages ?? SINGLE_FRAME_PAGE_COUNT;
  const isAnimated =
    pages > SINGLE_FRAME_PAGE_COUNT && pages <= MAX_ANIMATION_FRAMES;
  const outputFormat = preset.format ?? metadata.format ?? "";
  return isAnimated && ANIMATED_OUTPUT_FORMATS.has(outputFormat);
}

/**
 * Renders a preset: upright (EXIF), vectors at full size, animation kept when
 * the format allows and the frames are few enough. Refuses sources past
 * `MAX_INPUT_PIXELS`.
 */
export async function transformImage(
  source: Buffer,
  preset: MediaPresetConfig,
): Promise<Buffer> {
  const metadata = await readSourceMetadata(source);
  let pipeline = sharp(source, {
    density: vectorDensity(metadata, preset),
    animated: keepsAnimation(metadata, preset),
    limitInputPixels: MAX_INPUT_PIXELS,
  }).autoOrient();
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
  return pipeline.toBuffer().catch((error: unknown) => {
    throw new UnreadableImageError(
      error instanceof Error ? error.message : String(error),
    );
  });
}

function derivativeExtension(
  asset: MediaAsset,
  preset: MediaPresetConfig,
): string {
  if (preset.format) return preset.format;
  if (asset.mimetype === SVG_MIMETYPE) return RASTERIZED_SVG_FORMAT;
  return asset.name.split(".").pop() ?? "bin";
}

/** Readable download name of a derivative: `photo-01-thumb.webp`. */
export function derivativeFilename(
  asset: MediaAsset,
  preset: MediaPresetConfig,
): string {
  const baseName = asset.name.replace(/\.[^.]+$/, "");
  return `${baseName}-${preset.id}.${derivativeExtension(asset, preset)}`;
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
    derivativeFilename(asset, preset),
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
      await updateAssetMedia(
        assetModel,
        fresh,
        {
          json_derivatives: JSON.stringify({
            ...derivatives,
            [cacheKey]: storageKey,
          }),
        },
        TECHNICAL_MUTATION,
      )
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

function failureRetryDelay(error: unknown): number {
  return error instanceof UnreadableImageError
    ? UNREADABLE_IMAGE_RETRY_MS
    : GENERATION_FAILURE_RETRY_MS;
}

function pruneExpiredGenerationFailures(now: number): void {
  for (const [lockKey, failure] of generationFailures) {
    if (now - failure.failedAt >= failureRetryDelay(failure.error)) {
      generationFailures.delete(lockKey);
    }
  }
}

function assertNoRecentGenerationFailure(lockKey: string): void {
  pruneExpiredGenerationFailures(Date.now());
  const failure = generationFailures.get(lockKey);
  if (!failure) return;
  if (failure.error instanceof UnreadableImageError) throw failure.error;
  throw new Error("Derivative generation recently failed");
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
      generationFailures.set(lockKey, { failedAt: Date.now(), error });
      throw error;
    })
    .finally(() => generationLocks.delete(lockKey));
  generationLocks.set(lockKey, generation);
  return generation;
}
