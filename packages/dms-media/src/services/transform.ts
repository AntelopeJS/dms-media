import { randomUUID } from "node:crypto";
import { assert } from "@antelopejs/interface-api-util";
import type { MediaAsset } from "../db";
import { uploadStorageBytes } from "../derivatives";
import { type MediaFileSource, recordMediaEvent } from "../library/events";
import { loadNamesContaining } from "../library/listing";
import { entryStem, uniqueEntryName } from "../library/zip";
import {
  AnimatedImageTransformError,
  applyImageTransform,
  type ImageTransformOps,
  MediaAssetChangedError,
  OversizedImageTransformError,
  renderAssetTransform,
} from "../transform";
import {
  type MediaRequestContext,
  requireFolderRight,
} from "../routes/media/context";
import { assertEditableAsset } from "../routes/media/delivery";
import { requireReadableAsset } from "./files";

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;

export async function translatingTransformErrors<T>(
  work: Promise<T>,
): Promise<T> {
  try {
    return await work;
  } catch (error) {
    assert(
      !(error instanceof AnimatedImageTransformError),
      HTTP_UNPROCESSABLE_ENTITY,
      "Animated images cannot be edited",
    );
    assert(
      !(error instanceof OversizedImageTransformError),
      HTTP_UNPROCESSABLE_ENTITY,
      "This image is too large to be edited",
    );
    assert(
      !(error instanceof MediaAssetChangedError),
      HTTP_CONFLICT,
      "This image was changed by someone else in the meantime. Reload the page to see the latest version.",
    );
    throw error;
  }
}

/** A readable image of a type the editor handles, in a folder the actor may write. */
export async function requireEditableAsset(
  context: MediaRequestContext,
  assetId: string,
): Promise<MediaAsset> {
  const asset = await requireReadableAsset(context, assetId);
  requireFolderRight(context, asset.folderId, "write");
  assertEditableAsset(asset);
  return asset;
}

/** The name an edited copy of `asset` gets: free in its folder. */
export async function copyName(
  context: MediaRequestContext,
  asset: MediaAsset,
): Promise<string> {
  const siblings = await loadNamesContaining(
    context.assetModel,
    asset.folderId,
    [entryStem(asset.name)],
  );
  const taken = new Set(siblings.map((name) => name.toLowerCase()));
  return uniqueEntryName(asset.name, taken);
}

/** Renders the edit into a new asset next to the source, which stays untouched. */
async function createEditedCopy(
  context: MediaRequestContext,
  asset: MediaAsset,
  ops: ImageTransformOps,
): Promise<MediaAsset> {
  const rendered = await renderAssetTransform(asset, ops);
  const name = await copyName(context, asset);
  const storageKey = await uploadStorageBytes(
    rendered.bytes,
    name,
    asset.mimetype,
    `media/${context.tenantId}/${asset.folderId}/${randomUUID()}`,
    asset.storage,
  );
  const [copyId] = await context.assetModel.insert({
    folderId: asset.folderId,
    mediaRevision: randomUUID(),
    json_retiredFiles: "[]",
    name,
    mimetype: asset.mimetype,
    size: rendered.bytes.byteLength,
    storageKey,
    storage: asset.storage,
    width: rendered.width,
    height: rendered.height,
    alt: asset.alt,
    visibility: "inherit",
    createdBy: context.user._id,
  });
  const copy = await context.assetModel.get(copyId);
  assert(copy, HTTP_BAD_REQUEST, "Copy creation failed");
  return copy;
}

/**
 * Renders the edit into a new file next to the source and records it as an
 * added file, `source` telling how it was added.
 */
export async function transformAsCopy(
  context: MediaRequestContext,
  asset: MediaAsset,
  ops: ImageTransformOps,
  source: MediaFileSource,
): Promise<MediaAsset> {
  const copy = await translatingTransformErrors(
    createEditedCopy(context, asset, ops),
  );
  await recordMediaEvent(
    context,
    {
      kind: "asset.upload",
      targetName: copy.name,
      folderId: copy.folderId,
      assetId: copy._id,
      size: copy.size,
      details: { copiedFrom: asset.name },
    },
    {
      assets: [copy],
      foldersById: context.foldersById,
      source,
      copiedFromAssetId: asset._id,
    },
  );
  return copy;
}

/** Edits the file in place, keeping the original restorable, and records it. */
export async function transformInPlace(
  context: MediaRequestContext,
  asset: MediaAsset,
  ops: ImageTransformOps,
): Promise<MediaAsset> {
  await translatingTransformErrors(
    applyImageTransform(context.assetModel, asset, ops),
  );
  const updated = await context.assetModel.get(asset._id);
  assert(updated, HTTP_CONFLICT, "Asset disappeared during transform");
  await recordMediaEvent(context, {
    kind: "asset.transform",
    targetName: updated.name,
    folderId: updated.folderId,
    assetId: updated._id,
    details: {
      width: updated.width ?? 0,
      height: updated.height ?? 0,
    },
  });
  return updated;
}
