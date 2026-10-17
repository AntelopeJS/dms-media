import type {
  MediaDeclarationResult,
  MediaFolderDeclaration,
} from "@antelopejs/interface-dms-media";
import { serializeAcl } from "../acl";
import type { MediaDeclaration, MediaFolder } from "../db";
import { recordMediaEvent } from "../library/events";
import {
  buildChildPath,
  hasSiblingNamed,
  isMoveInsideSubtree,
  rewriteDescendantPaths,
} from "../routes/media/folders";
import {
  declaredFolderSchema,
  type DeclaredFolderInput,
} from "../validation/declared.schema";
import { waitForTenant } from "./readiness";
import {
  DECLARED_CONTENT_AUTHOR,
  type DeclaredModels,
  declaredModels,
  hashState,
  judgeDeclaredRow,
  MediaDeclarationError,
  parseDeclaration,
  saveDeclaration,
  settlePendingDeclaration,
  withDeclarationLock,
} from "./records";

/** A declared folder looked up by key: absent when a member deleted it. */
export interface DeclaredFolderLookup {
  folder?: MediaFolder;
}

/** The member-editable state of a folder: its name, place, visibility and ACL. */
function folderStateHash(folder: MediaFolder): string {
  return hashState({
    name: folder.name,
    parentId: folder.parentId || null,
    visibility: folder.visibility,
    acl: folder.json_acl || null,
  });
}

function folderDeclarationHash(declaration: DeclaredFolderInput): string {
  return hashState({
    name: declaration.name,
    parent: declaration.parent ?? null,
    visibility: declaration.visibility,
    acl: declaration.acl ?? null,
  });
}

/**
 * The folder declared under `key`. Throws when no module ever declared it,
 * since that is a mistake in the calling code rather than a member's change.
 */
export async function findDeclaredFolder(
  models: DeclaredModels,
  key: string,
  onUnknown: (reason: string) => never,
): Promise<DeclaredFolderLookup> {
  await settlePendingDeclaration(models.tenantId, "folder", key);
  const record = await models.declarationModel.findByKey("folder", key);
  if (!record)
    onUnknown(
      `'${key}' is not a declared folder: declare it with EnsureMediaFolder first`,
    );
  return { folder: await models.folderModel.get(record.targetId) };
}

async function createFolder(
  models: DeclaredModels,
  declaration: DeclaredFolderInput,
  parent: MediaFolder | undefined,
): Promise<MediaFolder> {
  const folders = await models.folderModel.getAll();
  if (hasSiblingNamed(folders, declaration.name, parent?._id))
    throw new MediaDeclarationError(
      "folder",
      declaration.key,
      `a folder named '${declaration.name}' already exists there`,
    );
  const [folderId] = await models.folderModel.insert({
    name: declaration.name,
    parentId: parent?._id,
    path: buildChildPath(parent),
    visibility: declaration.visibility,
    json_acl: serializeAcl(declaration.acl),
  });
  const folder = await models.folderModel.get(folderId);
  if (!folder)
    throw new MediaDeclarationError(
      "folder",
      declaration.key,
      "the folder could not be created",
    );
  await recordMediaEvent(
    { tenantId: models.tenantId, user: DECLARED_CONTENT_AUTHOR },
    {
      kind: "folder.create",
      targetName: folder.name,
      folderId: parent?._id,
      details: { targetId: folder._id },
    },
  );
  return folder;
}

async function refreshFolder(
  models: DeclaredModels,
  declaration: DeclaredFolderInput,
  folder: MediaFolder,
  parent: MediaFolder | undefined,
): Promise<MediaFolder | undefined> {
  if (isMoveInsideSubtree(folder, parent))
    throw new MediaDeclarationError(
      "folder",
      declaration.key,
      "Cannot move a folder inside itself",
    );
  const folders = await models.folderModel.getAll();
  if (hasSiblingNamed(folders, declaration.name, parent?._id, folder._id))
    throw new MediaDeclarationError(
      "folder",
      declaration.key,
      `a folder named '${declaration.name}' already exists there`,
    );
  // An empty ACL string reads as no ACL: the folder inherits its parent's.
  const patch: Partial<MediaFolder> = {
    name: declaration.name,
    parentId: parent?._id,
    path: buildChildPath(parent),
    visibility: declaration.visibility,
    json_acl: serializeAcl(declaration.acl) ?? "",
  };
  if (!(await models.folderModel.compareDeclared(folder, patch)))
    return undefined;
  if ((folder.parentId || undefined) !== parent?._id) {
    await rewriteDescendantPaths(
      { folderModel: models.folderModel, folders },
      folder,
      patch.path ?? [],
    );
  }
  // Remember only our write, not a member's edit made just after it.
  return Object.assign(folder, patch);
}

async function applyFolderDeclaration(
  declaration: DeclaredFolderInput,
): Promise<MediaDeclarationResult> {
  await waitForTenant(declaration.tenantId);
  const models = declaredModels(declaration.tenantId);
  const fail = (reason: string): never => {
    throw new MediaDeclarationError("folder", declaration.key, reason);
  };
  const parentLookup = declaration.parent
    ? await findDeclaredFolder(models, declaration.parent, fail)
    : undefined;
  const parent = parentLookup?.folder;
  const isParentDeleted = Boolean(parentLookup) && !parent;
  const record = await models.declarationModel.findByKey(
    "folder",
    declaration.key,
  );
  const declaredHash = folderDeclarationHash(declaration);
  if (!record) {
    // The parent a member deleted takes its declared children with it.
    if (isParentDeleted) return { status: "deleted" };
    const folder = await createFolder(models, declaration, parent);
    await rememberFolder(models, undefined, declaration, folder, declaredHash);
    return { status: "created", id: folder._id };
  }
  const folder = await models.folderModel.get(record.targetId);
  const verdict = judgeDeclaredRow(
    record,
    folder,
    folder && folderStateHash(folder),
    declaredHash,
  );
  if (verdict || !folder) return verdict ?? { status: "deleted" };
  if (isParentDeleted) return { status: "preserved", id: folder._id };
  const refreshed = await refreshFolder(models, declaration, folder, parent);
  if (!refreshed) {
    const current = await models.folderModel.get(folder._id);
    return current
      ? { status: "preserved", id: folder._id }
      : { status: "deleted" };
  }
  await rememberFolder(models, record, declaration, refreshed, declaredHash);
  return { status: "updated", id: refreshed._id };
}

function rememberFolder(
  models: DeclaredModels,
  record: MediaDeclaration | undefined,
  declaration: DeclaredFolderInput,
  folder: MediaFolder,
  declaredHash: string,
): Promise<void> {
  return saveDeclaration(models.declarationModel, record, {
    kind: "folder",
    key: declaration.key,
    targetId: folder._id,
    declaredHash,
    appliedHash: folderStateHash(folder),
  });
}

/** Implements `EnsureMediaFolder`. */
export async function ensureDeclaredFolder(
  input: MediaFolderDeclaration,
): Promise<MediaDeclarationResult> {
  const declaration = parseDeclaration("folder", input, declaredFolderSchema);
  if (declaration.parent === declaration.key)
    throw new MediaDeclarationError(
      "folder",
      declaration.key,
      "a folder cannot be its own parent",
    );
  return withDeclarationLock(
    declaration.tenantId,
    "folder",
    declaration.key,
    () => applyFolderDeclaration(declaration),
  );
}
