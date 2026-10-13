import { randomUUID } from "node:crypto";
import { DeleteFile } from "@antelopejs/interface-file-storage";
import sharp from "sharp";
import { cleanupAssetFiles, updateAssetMedia } from "./asset-lifecycle";
import type { MediaAsset, MediaAssetModel } from "./db";
import { downloadStorageBytes, uploadStorageBytes } from "./derivatives";
import {
  composeTransforms,
  type CropRegion,
  type ImageTransformOps,
  parseTransform,
} from "./transform-ops";

export * from "./transform-ops";

const TRANSFORMED_PATH_PREFIX = "media-transformed";
const MIN_CROP_PIXELS = 1;
const SINGLE_FRAME_PAGE_COUNT = 1;
const NO_ROTATION = 0;

/**
 * Re-encoding settings of an edited image: high enough that a crop does not
 * visibly degrade the photo. PNG stays lossless (a quality would quantize it).
 */
type EditOutputOptions =
  | sharp.JpegOptions
  | sharp.WebpOptions
  | sharp.AvifOptions;

const EDIT_OUTPUT_OPTIONS: Record<string, EditOutputOptions> = {
  jpeg: { quality: 92, mozjpeg: true },
  webp: { quality: 92 },
  avif: { quality: 80 },
};

export class AnimatedImageTransformError extends Error {}
/** Someone else changed the image while this edit was being rendered. */
export class MediaAssetChangedError extends Error {}

export interface PixelDimensions {
  width: number;
  height: number;
}

/** A rendered edit: the bytes and the cumulative operations they hold. */
export interface RenderedTransform {
  bytes: Buffer;
  width?: number;
  height?: number;
  cumulative: ImageTransformOps;
}

function rotatedDimensions(
  dimensions: PixelDimensions,
  rotate: number,
): PixelDimensions {
  const swapsAxes = rotate % 180 !== 0;
  return swapsAxes
    ? { width: dimensions.height, height: dimensions.width }
    : dimensions;
}

const EXIF_ORIENTATION_AXIS_SWAP_THRESHOLD = 5;

export function cropToPixels(
  crop: CropRegion,
  dimensions: PixelDimensions,
): sharp.Region {
  const left = Math.min(
    Math.round(crop.x * dimensions.width),
    dimensions.width - MIN_CROP_PIXELS,
  );
  const top = Math.min(
    Math.round(crop.y * dimensions.height),
    dimensions.height - MIN_CROP_PIXELS,
  );
  const width = Math.max(
    MIN_CROP_PIXELS,
    Math.min(
      Math.round(crop.width * dimensions.width),
      dimensions.width - left,
    ),
  );
  const height = Math.max(
    MIN_CROP_PIXELS,
    Math.min(
      Math.round(crop.height * dimensions.height),
      dimensions.height - top,
    ),
  );
  return { left, top, width, height };
}

function orientedDimensions(metadata: sharp.Metadata): PixelDimensions {
  const width = metadata.width ?? MIN_CROP_PIXELS;
  const height = metadata.height ?? MIN_CROP_PIXELS;
  const swapsAxes =
    metadata.orientation != null &&
    metadata.orientation >= EXIF_ORIENTATION_AXIS_SWAP_THRESHOLD;
  return swapsAxes ? { width: height, height: width } : { width, height };
}

function assertStaticSource(metadata: sharp.Metadata): void {
  if ((metadata.pages ?? SINGLE_FRAME_PAGE_COUNT) <= SINGLE_FRAME_PAGE_COUNT) {
    return;
  }
  throw new AnimatedImageTransformError(
    "Animated images cannot be transformed",
  );
}

function encodeLikeSource(
  pipeline: sharp.Sharp,
  metadata: sharp.Metadata,
): sharp.Sharp {
  const kept = pipeline.keepMetadata();
  const options = metadata.format && EDIT_OUTPUT_OPTIONS[metadata.format];
  if (!options || !metadata.format) return kept;
  return kept.toFormat(metadata.format, options);
}

export async function renderTransform(
  source: Buffer,
  ops: ImageTransformOps,
): Promise<Buffer> {
  const metadata = await sharp(source).metadata();
  assertStaticSource(metadata);
  const sourceDimensions = orientedDimensions(metadata);
  let pipeline = sharp(source).autoOrient();
  if (ops.rotate) {
    pipeline = pipeline.rotate(ops.rotate);
  }
  if (ops.crop) {
    const dimensions = rotatedDimensions(
      sourceDimensions,
      ops.rotate ?? NO_ROTATION,
    );
    pipeline = pipeline.extract(cropToPixels(ops.crop, dimensions));
  }
  return encodeLikeSource(pipeline, metadata).toBuffer();
}

/**
 * Renders an edit from the untouched original with the operations already
 * applied, so successive edits never stack re-encodings.
 */
export async function renderAssetTransform(
  asset: MediaAsset,
  ops: ImageTransformOps,
): Promise<RenderedTransform> {
  const cumulative = composeTransforms(
    parseTransform(asset.json_transform),
    ops,
  );
  const sourceKey = asset.originalKey || asset.storageKey;
  const source = await downloadStorageBytes(sourceKey, asset.storage);
  const bytes = await renderTransform(source, cumulative);
  const metadata = await sharp(bytes).metadata();
  return { bytes, width: metadata.width, height: metadata.height, cumulative };
}

async function commitTransform(
  model: MediaAssetModel,
  asset: MediaAsset,
  patch: Partial<MediaAsset>,
): Promise<void> {
  for (;;) {
    const fresh = await model.get(asset._id);
    if (!fresh || fresh.isDeleting || fresh.storageKey !== asset.storageKey) {
      throw new MediaAssetChangedError("Media asset changed during transform");
    }
    if (
      await updateAssetMedia(model, fresh, { ...patch, json_derivatives: "" })
    )
      break;
  }
  await cleanupAssetFiles(model, asset._id);
}

function originalPatch(asset: MediaAsset): Partial<MediaAsset> {
  if (asset.originalKey) {
    return {
      originalKey: asset.originalKey,
      originalSize: asset.originalSize,
    };
  }
  return { originalKey: asset.storageKey, originalSize: asset.size };
}

export async function applyImageTransform(
  assetModel: MediaAssetModel,
  asset: MediaAsset,
  ops: ImageTransformOps,
): Promise<void> {
  const rendered = await renderAssetTransform(asset, ops);
  const storageKey = await uploadStorageBytes(
    rendered.bytes,
    asset.name,
    asset.mimetype,
    `${TRANSFORMED_PATH_PREFIX}/${asset._id}/${randomUUID()}`,
    asset.storage,
  );
  await commitTransform(assetModel, asset, {
    storageKey,
    ...originalPatch(asset),
    json_transform: JSON.stringify(rendered.cumulative),
    width: rendered.width,
    height: rendered.height,
    size: rendered.bytes.byteLength,
  }).catch(async (error: unknown) => {
    if (error instanceof MediaAssetChangedError) {
      await DeleteFile(storageKey, asset.storage).catch(() => undefined);
    }
    throw error;
  });
}

export async function revertImageTransform(
  assetModel: MediaAssetModel,
  asset: MediaAsset,
): Promise<void> {
  if (!asset.originalKey) return;
  const original = await downloadStorageBytes(asset.originalKey, asset.storage);
  const metadata = await sharp(original).metadata();
  const dimensions = orientedDimensions(metadata);
  await commitTransform(assetModel, asset, {
    storageKey: asset.originalKey,
    originalKey: "",
    originalSize: 0,
    json_transform: "",
    width: dimensions.width,
    height: dimensions.height,
    size: original.byteLength,
  });
}
