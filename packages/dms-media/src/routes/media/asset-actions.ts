import { assert } from "@antelopejs/interface-api-util";
import { deleteMediaAsset } from "../../asset-lifecycle";
import { feedingBinding } from "../../bindings";
import type { MediaAsset, MediaFolder } from "../../db";
import { bindingAccepts } from "../../library/binding-labels";
import { recordMediaEvent } from "../../library/events";
import { forgetFavorites } from "../../library/favorites";
import type { AssetVisibility } from "../../types";
import { mimetypeMatches } from "../../upload-policy";
import { comparableName, MEDIA_ERRORS } from "../../validation/media.schema";
import {
  assertMediaOwner,
  type MediaRequestContext,
  requireFolderRight,
} from "./context";
import { resolveEffectiveVisibility } from "./dto";

const HTTP_CONFLICT = 409;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;

export interface AssetChanges {
  name?: string;
  alt?: string;
}

function changesEffectiveVisibility(
  asset: MediaAsset,
  sourceFolder: MediaFolder,
  targetFolder: MediaFolder,
): boolean {
  return (
    resolveEffectiveVisibility(asset, sourceFolder) !==
    resolveEffectiveVisibility(asset, targetFolder)
  );
}

/** Refuses a name another file of `folderId` already has, regardless of case. */
async function assertFreeAssetName(
  context: MediaRequestContext,
  asset: MediaAsset,
  folderId: string,
  name: string,
): Promise<void> {
  const wanted = comparableName(name);
  const siblings = await context.assetModel.getBy("folderId", folderId);
  const clash = siblings.some(
    (sibling) =>
      sibling._id !== asset._id &&
      !sibling.isDeleting &&
      comparableName(sibling.name) === wanted,
  );
  assert(!clash, HTTP_CONFLICT, MEDIA_ERRORS.nameTaken);
}

export async function updateAssetDetails(
  context: MediaRequestContext,
  asset: MediaAsset,
  changes: AssetChanges,
): Promise<void> {
  requireFolderRight(context, asset.folderId, "write");
  const isRename = changes.name !== undefined && changes.name !== asset.name;
  if (isRename) {
    await assertFreeAssetName(
      context,
      asset,
      asset.folderId,
      changes.name ?? "",
    );
  }
  await context.assetModel.update(asset._id, changes);
  const isAltChange = changes.alt !== undefined && changes.alt !== asset.alt;
  if (isRename) {
    await recordMediaEvent(context, {
      kind: "asset.rename",
      targetName: changes.name ?? asset.name,
      folderId: asset.folderId,
      assetId: asset._id,
      details: { previous: asset.name },
    });
  }
  if (isAltChange) {
    await recordMediaEvent(context, {
      kind: "asset.alt",
      targetName: changes.name ?? asset.name,
      folderId: asset.folderId,
      assetId: asset._id,
    });
  }
}

export async function moveAsset(
  context: MediaRequestContext,
  asset: MediaAsset,
  folderId: string,
): Promise<void> {
  const sourceFolder = requireFolderRight(context, asset.folderId, "write");
  const targetFolder = requireFolderRight(context, folderId, "write");
  if (sourceFolder._id === targetFolder._id) return;
  const accepted = bindingAccepts(
    feedingBinding(targetFolder, context.foldersById),
  );
  assert(
    !accepted || mimetypeMatches(asset.mimetype, accepted),
    HTTP_UNSUPPORTED_MEDIA_TYPE,
    MEDIA_ERRORS.fieldType,
  );
  if (changesEffectiveVisibility(asset, sourceFolder, targetFolder)) {
    assertMediaOwner(context);
  }
  await assertFreeAssetName(context, asset, folderId, asset.name);
  await context.assetModel.update(asset._id, { folderId });
  await recordMediaEvent(context, {
    kind: "asset.move",
    targetName: asset.name,
    folderId,
    assetId: asset._id,
    details: { source: sourceFolder.name, destination: targetFolder.name },
  });
}

export async function setAssetVisibility(
  context: MediaRequestContext,
  asset: MediaAsset,
  visibility: AssetVisibility,
): Promise<void> {
  requireFolderRight(context, asset.folderId, "manage");
  assertMediaOwner(context);
  await context.assetModel.update(asset._id, { visibility });
  await recordMediaEvent(context, {
    kind: "asset.visibility",
    targetName: asset.name,
    folderId: asset.folderId,
    assetId: asset._id,
    details: { visibility: `$dms_media.visibility.${visibility}` },
  });
}

export async function removeAsset(
  context: MediaRequestContext,
  asset: MediaAsset,
): Promise<void> {
  requireFolderRight(context, asset.folderId, "write");
  await deleteMediaAsset(context.assetModel, asset._id);
  await forgetFavorites(context.tenantId, [asset._id]);
  await recordMediaEvent(context, {
    kind: "asset.delete",
    targetName: asset.name,
    folderId: asset.folderId,
    assetId: asset._id,
    size: asset.size,
  });
}
