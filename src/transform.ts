import { randomUUID } from "node:crypto";
import { DeleteFile } from "@antelopejs/interface-file-storage";
import sharp from "sharp";
import { cleanupAssetFiles, updateAssetMedia } from "./asset-lifecycle";
import type { MediaAsset, MediaAssetModel } from "./db";
import { downloadStorageBytes, uploadStorageBytes } from "./derivatives";

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageTransformOps {
  crop?: CropRegion;
  rotate?: number;
}

const TRANSFORMED_PATH_PREFIX = "media-transformed";
const MIN_CROP_PIXELS = 1;
const SINGLE_FRAME_PAGE_COUNT = 1;

export class AnimatedImageTransformError extends Error {}
class MediaAssetChangedError extends Error {}

export interface PixelDimensions {
  width: number;
  height: number;
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

async function renderTransform(
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
    const dimensions = rotatedDimensions(sourceDimensions, ops.rotate ?? 0);
    pipeline = pipeline.extract(cropToPixels(ops.crop, dimensions));
  }
  return pipeline.toBuffer();
}

export async function clearDerivatives(
  assetModel: MediaAssetModel,
  asset: MediaAsset,
): Promise<void> {
  for (;;) {
    const fresh = await assetModel.get(asset._id);
    if (!fresh || fresh.isDeleting) return;
    if (await updateAssetMedia(assetModel, fresh, { json_derivatives: "" }))
      break;
  }
  await cleanupAssetFiles(assetModel, asset._id);
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

export async function applyImageTransform(
  assetModel: MediaAssetModel,
  asset: MediaAsset,
  ops: ImageTransformOps,
): Promise<void> {
  const source = await downloadStorageBytes(asset.storageKey, asset.storage);
  const output = await renderTransform(source, ops);
  const outputMetadata = await sharp(output).metadata();
  const storageKey = await uploadStorageBytes(
    output,
    asset.name,
    asset.mimetype,
    `${TRANSFORMED_PATH_PREFIX}/${asset._id}/${randomUUID()}`,
    asset.storage,
  );
  await commitTransform(assetModel, asset, {
    storageKey,
    originalKey: asset.originalKey || asset.storageKey,
    width: outputMetadata.width,
    height: outputMetadata.height,
    size: output.byteLength,
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
  await commitTransform(assetModel, asset, {
    storageKey: asset.originalKey,
    originalKey: "",
    width: metadata.width,
    height: metadata.height,
    size: original.byteLength,
  });
}
