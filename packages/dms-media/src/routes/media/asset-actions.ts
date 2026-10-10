import { deleteMediaAsset } from "../../asset-lifecycle";
import type { MediaAsset, MediaFolder } from "../../db";
import { recordMediaEvent } from "../../library/events";
import { forgetFavorites } from "../../library/favorites";
import type { AssetVisibility } from "../../types";
import {
  assertPermissionsManager,
  type MediaRequestContext,
  requireFolderRight,
} from "./context";
import { resolveEffectiveVisibility } from "./dto";

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

export async function updateAssetDetails(
  context: MediaRequestContext,
  asset: MediaAsset,
  changes: AssetChanges,
): Promise<void> {
  requireFolderRight(context, asset.folderId, "write");
  await context.assetModel.update(asset._id, changes);
  const isRename = changes.name !== undefined && changes.name !== asset.name;
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
  if (changesEffectiveVisibility(asset, sourceFolder, targetFolder)) {
    await assertPermissionsManager(context);
  }
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
  await assertPermissionsManager(context);
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
