import { assert } from "@antelopejs/interface-api-util";
import { deleteMediaAsset } from "../asset-lifecycle";
import { feedingBinding } from "../bindings";
import type { MediaAsset, MediaFolder } from "../db";
import { bindingAccepts } from "../library/binding-labels";
import { recordMediaEvent } from "../library/events";
import { forgetFavorites } from "../library/favorites";
import type { AssetVisibility, FolderVisibility } from "../types";
import { mimetypeMatches } from "../upload-policy";
import { comparableName, MEDIA_ERRORS } from "../validation/media.schema";
import {
  assertMediaOwner,
  type MediaRequestContext,
  requireFolderRight,
} from "../routes/media/context";
import { resolveEffectiveVisibility } from "../routes/media/dto";

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;

export interface AssetChanges {
  name?: string;
  alt?: string;
}

/** A rename or alt change, checked and ready to write. */
export interface DetailsPlan {
  asset: MediaAsset;
  changes: AssetChanges;
  isRename: boolean;
  isAltChange: boolean;
}

/** A move, checked and ready to write; `moved` is false when the file is already there. */
export interface MovePlan {
  asset: MediaAsset;
  source: MediaFolder;
  target: MediaFolder;
  moved: boolean;
  previousEffective: FolderVisibility;
  effective: FolderVisibility;
}

/** A visibility change, checked and ready to write. */
export interface VisibilityPlan {
  asset: MediaAsset;
  visibility: AssetVisibility;
  changed: boolean;
  previousEffective: FolderVisibility;
  effective: FolderVisibility;
}

/** The live file `assetId` names, in a folder the actor may read; 404 otherwise. */
export async function requireReadableAsset(
  context: MediaRequestContext,
  assetId: string,
): Promise<MediaAsset> {
  const asset = await context.assetModel.get(assetId);
  assert(
    asset && !asset.isDeleting && context.access.readable.has(asset.folderId),
    HTTP_NOT_FOUND,
    MEDIA_ERRORS.assetNotFound,
  );
  return asset;
}

/** The row as written, else the row as it was: what a trigger reports. */
async function reread(
  context: MediaRequestContext,
  asset: MediaAsset,
): Promise<MediaAsset> {
  return (await context.assetModel.get(asset._id)) ?? asset;
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

export async function planAssetDetails(
  context: MediaRequestContext,
  asset: MediaAsset,
  changes: AssetChanges,
): Promise<DetailsPlan> {
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
  const isAltChange = changes.alt !== undefined && changes.alt !== asset.alt;
  return { asset, changes, isRename, isAltChange };
}

export async function applyAssetDetails(
  context: MediaRequestContext,
  { asset, changes, isRename, isAltChange }: DetailsPlan,
): Promise<void> {
  await context.assetModel.update(asset._id, changes);
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

export async function updateAssetDetails(
  context: MediaRequestContext,
  asset: MediaAsset,
  changes: AssetChanges,
): Promise<void> {
  await applyAssetDetails(
    context,
    await planAssetDetails(context, asset, changes),
  );
}

export async function planAssetMove(
  context: MediaRequestContext,
  asset: MediaAsset,
  folderId: string,
): Promise<MovePlan> {
  const source = requireFolderRight(context, asset.folderId, "write");
  const target = requireFolderRight(context, folderId, "write");
  const previousEffective = resolveEffectiveVisibility(asset, source);
  const effective = resolveEffectiveVisibility(asset, target);
  const plan = { asset, source, target, previousEffective, effective };
  if (source._id === target._id) return { ...plan, moved: false };
  const accepted = bindingAccepts(feedingBinding(target, context.foldersById));
  assert(
    !accepted || mimetypeMatches(asset.mimetype, accepted),
    HTTP_UNSUPPORTED_MEDIA_TYPE,
    MEDIA_ERRORS.fieldType,
  );
  if (previousEffective !== effective) assertMediaOwner(context);
  await assertFreeAssetName(context, asset, folderId, asset.name);
  return { ...plan, moved: true };
}

export async function applyAssetMove(
  context: MediaRequestContext,
  plan: MovePlan,
): Promise<void> {
  const { asset, source, target } = plan;
  if (!plan.moved) return;
  await context.assetModel.update(asset._id, { folderId: target._id });
  await recordMediaEvent(
    context,
    {
      kind: "asset.move",
      targetName: asset.name,
      folderId: target._id,
      assetId: asset._id,
      details: { source: source.name, destination: target.name },
    },
    {
      assets: [await reread(context, asset)],
      foldersById: context.foldersById,
      previousEffective: () => plan.previousEffective,
    },
  );
}

export async function moveAsset(
  context: MediaRequestContext,
  asset: MediaAsset,
  folderId: string,
): Promise<void> {
  await applyAssetMove(context, await planAssetMove(context, asset, folderId));
}

export function planAssetVisibility(
  context: MediaRequestContext,
  asset: MediaAsset,
  visibility: AssetVisibility,
): VisibilityPlan {
  const folder = requireFolderRight(context, asset.folderId, "manage");
  assertMediaOwner(context);
  return {
    asset,
    visibility,
    changed: visibility !== asset.visibility,
    previousEffective: resolveEffectiveVisibility(asset, folder),
    effective: visibility === "inherit" ? folder.visibility : visibility,
  };
}

export async function applyAssetVisibility(
  context: MediaRequestContext,
  plan: VisibilityPlan,
): Promise<void> {
  const { asset, visibility } = plan;
  await context.assetModel.update(asset._id, { visibility });
  await recordMediaEvent(
    context,
    {
      kind: "asset.visibility",
      targetName: asset.name,
      folderId: asset.folderId,
      assetId: asset._id,
      details: { visibility: `$dms_media.visibility.${visibility}` },
    },
    {
      assets: [await reread(context, asset)],
      foldersById: context.foldersById,
      previousEffective: () => plan.previousEffective,
    },
  );
}

export async function setAssetVisibility(
  context: MediaRequestContext,
  asset: MediaAsset,
  visibility: AssetVisibility,
): Promise<void> {
  await applyAssetVisibility(
    context,
    planAssetVisibility(context, asset, visibility),
  );
}

export function planAssetRemoval(
  context: MediaRequestContext,
  asset: MediaAsset,
): MediaAsset {
  requireFolderRight(context, asset.folderId, "write");
  return asset;
}

export async function applyAssetRemoval(
  context: MediaRequestContext,
  asset: MediaAsset,
): Promise<void> {
  await deleteMediaAsset(context.assetModel, asset._id);
  await forgetFavorites(context.tenantId, [asset._id]);
  await recordMediaEvent(
    context,
    {
      kind: "asset.delete",
      targetName: asset.name,
      folderId: asset.folderId,
      assetId: asset._id,
      size: asset.size,
    },
    { assets: [asset], foldersById: context.foldersById },
  );
}

export async function removeAsset(
  context: MediaRequestContext,
  asset: MediaAsset,
): Promise<void> {
  await applyAssetRemoval(context, planAssetRemoval(context, asset));
}
