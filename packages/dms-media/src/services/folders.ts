import { assert } from "@antelopejs/interface-api-util";
import { IsDuplicateKeyError } from "@antelopejs/interface-database";
import { randomUUID } from "node:crypto";
import { deleteMediaAsset } from "../asset-lifecycle";
import { holdsSubfolders } from "../bindings";
import type { MediaAsset, MediaFolder } from "../db";
import { fixedId } from "../fixed-id";
import { recordMediaEvent } from "../library/events";
import { forgetFavorites } from "../library/favorites";
import type { FolderVisibility } from "../types";
import { comparableName, MEDIA_ERRORS } from "../validation/media.schema";
import {
  assertMediaOwner,
  assertNotBound,
  getDescendantFolders,
  type MediaRequestContext,
  requireFolderRight,
} from "../routes/media/context";

const HTTP_FORBIDDEN = 403;
const HTTP_CONFLICT = 409;

type FolderTreeModels = Pick<MediaRequestContext, "folderModel" | "assetModel">;

/** Whether another folder under `parentId` has this name, case and Unicode form aside. */
export function hasSiblingNamed(
  folders: MediaFolder[],
  name: string,
  parentId: string | undefined,
  ignoredId?: string,
): boolean {
  return findSiblingNamed(folders, name, parentId, ignoredId) !== undefined;
}

function findSiblingNamed(
  folders: MediaFolder[],
  name: string,
  parentId: string | undefined,
  ignoredId?: string,
): MediaFolder | undefined {
  const wanted = comparableName(name);
  return folders.find(
    (folder) =>
      folder._id !== ignoredId &&
      (folder.parentId ?? undefined) === parentId &&
      comparableName(folder.name) === wanted,
  );
}

export function assertUniqueSiblingName(
  context: MediaRequestContext,
  name: string,
  parentId: string | undefined,
  ignoredId?: string,
): void {
  const clash = hasSiblingNamed(context.folders, name, parentId, ignoredId);
  assert(!clash, HTTP_CONFLICT, MEDIA_ERRORS.folderNameTaken);
}

/** The parent a new or moved folder goes under, checked: root needs root `manage`, a linked parent must hold subfolders. */
export function assertCanPlaceUnder(
  context: MediaRequestContext,
  parentId: string | undefined,
): MediaFolder | undefined {
  if (!parentId) {
    assert(
      context.rootRights.has("manage"),
      HTTP_FORBIDDEN,
      "Missing 'manage' right at the media root",
    );
    return undefined;
  }
  const parent = requireFolderRight(context, parentId, "manage");
  assert(holdsSubfolders(parent), HTTP_FORBIDDEN, MEDIA_ERRORS.boundParent);
  return parent;
}

export function buildChildPath(parent: MediaFolder | undefined): string[] {
  return parent ? [...parent.path, parent._id] : [];
}

async function deleteFolderAssets(
  context: FolderTreeModels,
  folderIds: string[],
): Promise<MediaAsset[]> {
  const assets = (
    await context.assetModel.getBy("folderId", ...folderIds)
  ).filter((asset) => !asset.isDeleting);
  await Promise.all(
    assets.map((asset) => deleteMediaAsset(context.assetModel, asset._id)),
  );
  return assets;
}

/**
 * Deletes folder rows first, then cascades from the database rather than the
 * request snapshot, so children and assets written concurrently under a
 * deleted folder are removed instead of left orphaned. Resolves with the
 * files it deleted, as they were.
 */
export async function deleteFolderTree(
  context: FolderTreeModels,
  folderIds: string[],
): Promise<MediaAsset[]> {
  const deleted: MediaAsset[] = [];
  let pending = folderIds;
  while (pending.length > 0) {
    await Promise.all(pending.map((id) => context.folderModel.delete(id)));
    const [lateChildren, assets] = await Promise.all([
      context.folderModel.getBy("parentId", ...pending),
      deleteFolderAssets(context, pending),
    ]);
    deleted.push(...assets);
    pending = lateChildren.map((child) => child._id);
  }
  return deleted;
}

/** A folder found or about to be created under a parent. */
export interface EnsureFolderPlan {
  name: string;
  parent?: MediaFolder;
  visibility: FolderVisibility;
  existing?: MediaFolder;
  /** The id the folder is created under: the same in every process for one parent and name. */
  id: string;
}

export interface EnsuredFolder {
  folder: MediaFolder;
  created: boolean;
}

export function planEnsureFolder(
  context: MediaRequestContext,
  name: string,
  parentId: string | undefined,
  visibility: FolderVisibility,
): EnsureFolderPlan {
  const parent = assertCanPlaceUnder(context, parentId);
  return {
    name,
    parent,
    visibility,
    existing: findSiblingNamed(context.folders, name, parentId),
    id: fixedId(
      "dms-media:automation-folder",
      context.tenantId,
      parentId ?? "",
      comparableName(name),
    ),
  };
}

async function insertFolder(
  context: MediaRequestContext,
  plan: EnsureFolderPlan,
  id: string,
): Promise<boolean> {
  try {
    await context.folderModel.insert({
      _id: id,
      name: plan.name,
      parentId: plan.parent?._id,
      path: buildChildPath(plan.parent),
      visibility: plan.visibility,
    });
    return true;
  } catch (error) {
    if (!IsDuplicateKeyError(error)) throw error;
    return false;
  }
}

function isSameFolder(folder: MediaFolder, plan: EnsureFolderPlan): boolean {
  return (
    (folder.parentId ?? undefined) === plan.parent?._id &&
    comparableName(folder.name) === comparableName(plan.name)
  );
}

/**
 * Returns the planned folder, inserting it under its fixed id when missing:
 * two runs ensuring it at once write one row. When the row under that id was
 * since renamed or moved away, the folder gets a fresh id.
 */
export async function applyEnsureFolder(
  context: MediaRequestContext,
  plan: EnsureFolderPlan,
): Promise<EnsuredFolder> {
  if (plan.existing) return { folder: plan.existing, created: false };
  let id = plan.id;
  if (!(await insertFolder(context, plan, id))) {
    const winner = await context.folderModel.get(id);
    if (winner && isSameFolder(winner, plan))
      return { folder: winner, created: false };
    id = randomUUID();
    await insertFolder(context, plan, id);
  }
  const folder = await context.folderModel.get(id);
  assert(folder, HTTP_CONFLICT, "Folder creation failed");
  await recordMediaEvent(context, {
    kind: "folder.create",
    targetName: folder.name,
    folderId: folder.parentId,
    details: { targetId: folder._id },
  });
  return { folder, created: true };
}

/** A folder visibility change, checked and ready to write. */
export interface FolderVisibilityPlan {
  folder: MediaFolder;
  visibility: FolderVisibility;
  changed: boolean;
}

export function planFolderVisibility(
  context: MediaRequestContext,
  folderId: string,
  visibility: FolderVisibility,
): FolderVisibilityPlan {
  const folder = requireFolderRight(context, folderId, "manage");
  assertMediaOwner(context);
  return { folder, visibility, changed: folder.visibility !== visibility };
}

/** The live files directly in the folder that follow its visibility. */
export async function loadInheritingFiles(
  context: MediaRequestContext,
  folderId: string,
): Promise<MediaAsset[]> {
  return (await context.assetModel.getByFolder(folderId)).filter(
    (asset) => asset.visibility === "inherit",
  );
}

export async function applyFolderVisibility(
  context: MediaRequestContext,
  { folder, visibility }: FolderVisibilityPlan,
): Promise<void> {
  await context.folderModel.update(folder._id, { visibility });
  const updated = await context.folderModel.get(folder._id);
  const foldersById = new Map(context.foldersById);
  if (updated) foldersById.set(folder._id, updated);
  await recordMediaEvent(
    context,
    {
      kind: "folder.visibility",
      targetName: folder.name,
      folderId: folder._id,
      details: { visibility: `$dms_media.visibility.${visibility}` },
    },
    {
      loadAssets: () => loadInheritingFiles(context, folder._id),
      foldersById,
      previousEffective: () => folder.visibility,
    },
  );
}

/** A folder deletion, checked: the folders and the files it removes. */
export interface FolderDeletionPlan {
  folder: MediaFolder;
  folderIds: string[];
  assets: MediaAsset[];
}

export async function planFolderDeletion(
  context: MediaRequestContext,
  folderId: string,
): Promise<FolderDeletionPlan> {
  const folder = requireFolderRight(context, folderId, "manage");
  assertNotBound(folder);
  const descendants = getDescendantFolders(context, folderId);
  for (const descendant of descendants) {
    assertNotBound(descendant);
    assert(
      context.access.manageable.has(descendant._id),
      HTTP_FORBIDDEN,
      "Missing 'manage' right on a subfolder",
    );
  }
  const folderIds = [folderId, ...descendants.map((child) => child._id)];
  const assets = (
    await context.assetModel.getBy("folderId", ...folderIds)
  ).filter((asset) => !asset.isDeleting);
  return { folder, folderIds, assets };
}

/** Deletes the planned tree and resolves with the files deleted, late arrivals included. */
export async function applyFolderDeletion(
  context: MediaRequestContext,
  { folder, folderIds }: FolderDeletionPlan,
): Promise<MediaAsset[]> {
  const deleted = await deleteFolderTree(context, folderIds);
  await forgetFavorites(context.tenantId, [
    ...folderIds,
    ...deleted.map((asset) => asset._id),
  ]);
  await recordMediaEvent(
    context,
    {
      kind: "folder.delete",
      targetName: folder.name,
      folderId: folder.parentId,
      count: deleted.length,
      size: deleted.reduce((total, asset) => total + asset.size, 0),
      details: {
        files: deleted.length,
        folders: folderIds.length,
      },
    },
    {
      assets: deleted,
      foldersById: context.foldersById,
      deletedFolder: folder,
    },
  );
  return deleted;
}
