import { MediaApiController } from "./controller";
import { randomUUID } from "node:crypto";
import { JSONBody, Parameter, Post } from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import type { MediaAsset } from "../../db";
import { uploadStorageBytes } from "../../derivatives";
import { uniqueEntryName } from "../../library/zip";
import {
  AnimatedImageTransformError,
  applyImageTransform,
  type ImageTransformOps,
  MediaAssetChangedError,
  renderAssetTransform,
  revertImageTransform,
} from "../../transform";
import { transformSchema } from "../../validation/media.schema";
import { requireReadableAsset } from "./assets";
import { type MediaRequestContext, requireFolderRight } from "./context";
import { assertEditableAsset } from "./delivery";
import { buildAssetDto } from "./dto";

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;

function translateTransformError(error: unknown): never {
  assert(
    !(error instanceof AnimatedImageTransformError),
    HTTP_UNPROCESSABLE_ENTITY,
    "Animated images cannot be edited",
  );
  assert(
    !(error instanceof MediaAssetChangedError),
    HTTP_CONFLICT,
    "This image was changed by someone else in the meantime. Reload the page to see the latest version.",
  );
  throw error;
}

async function requireEditableAsset(
  context: MediaRequestContext,
  assetId: string,
): Promise<MediaAsset> {
  const asset = await requireReadableAsset(context, assetId);
  requireFolderRight(context, asset.folderId, "write");
  assertEditableAsset(asset);
  return asset;
}

async function copyName(
  context: MediaRequestContext,
  asset: MediaAsset,
): Promise<string> {
  const siblings = await context.assetModel.getByFolder(asset.folderId);
  const taken = new Set(siblings.map((sibling) => sibling.name.toLowerCase()));
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

export class MediaTransformController extends MediaApiController {
  @Post("/assets/:assetId/transform")
  async transform(
    @Parameter("assetId", "param") assetId: string,
    @JSONBody() body: unknown,
  ) {
    const ops = assertValidation(body, (v) => transformSchema.parse(v));
    const context = await this.resolveContext();
    const asset = await requireEditableAsset(context, assetId);
    await applyImageTransform(context.assetModel, asset, ops).catch(
      translateTransformError,
    );
    const updated = await context.assetModel.get(assetId);
    assert(updated, HTTP_CONFLICT, "Asset disappeared during transform");
    await this.record(context, {
      kind: "asset.transform",
      targetName: updated.name,
      folderId: updated.folderId,
      assetId,
      details: {
        width: updated.width ?? 0,
        height: updated.height ?? 0,
      },
    });
    return { asset: buildAssetDto(context, updated) };
  }

  @Post("/assets/:assetId/transform/copy")
  async transformCopy(
    @Parameter("assetId", "param") assetId: string,
    @JSONBody() body: unknown,
  ) {
    const ops = assertValidation(body, (v) => transformSchema.parse(v));
    const context = await this.resolveContext();
    const asset = await requireEditableAsset(context, assetId);
    const copy = await createEditedCopy(context, asset, ops).catch(
      translateTransformError,
    );
    await this.record(context, {
      kind: "asset.upload",
      targetName: copy.name,
      folderId: copy.folderId,
      assetId: copy._id,
      size: copy.size,
      details: { copiedFrom: asset.name },
    });
    return { asset: buildAssetDto(context, copy) };
  }

  @Post("/assets/:assetId/revert")
  async revert(@Parameter("assetId", "param") assetId: string) {
    const context = await this.resolveContext();
    const asset = await requireReadableAsset(context, assetId);
    requireFolderRight(context, asset.folderId, "write");
    assert(
      Boolean(asset.originalKey),
      HTTP_CONFLICT,
      "Asset has no original to revert to",
    );
    await revertImageTransform(context.assetModel, asset).catch(
      translateTransformError,
    );
    const updated = await context.assetModel.get(assetId);
    assert(updated, HTTP_CONFLICT, "Asset disappeared during revert");
    await this.record(context, {
      kind: "asset.revert",
      targetName: updated.name,
      folderId: updated.folderId,
      assetId,
    });
    return { asset: buildAssetDto(context, updated) };
  }
}
