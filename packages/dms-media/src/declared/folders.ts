import type {
  MediaDeclarationResult,
  MediaFolderDeclaration,
} from "@antelopejs/interface-dms-media";
import { serializeAcl } from "../acl";
import { bindingHoldsSubfolders, ensureTenantBindings } from "../bindings";
import type { MediaFolder } from "../db";
import { recordMediaEvent } from "../library/events";
import { buildChildPath, hasSiblingNamed } from "../routes/media/folders";
import {
  declaredFolderSchema,
  type DeclaredFolderInput,
} from "../validation/declared.schema";
import { IsDuplicateKeyError } from "@antelopejs/interface-database";
import { createHash } from "node:crypto";
import {
  DECLARED_CONTENT_AUTHOR,
  type DeclaredModels,
  declaredModels,
  MediaDeclarationError,
  parseDeclaration,
  settlePendingDeclaration,
  withDeclarationLock,
} from "./records";
import { isString } from "../guards";

type ParentTarget = NonNullable<DeclaredFolderInput["parent"]>;

/**
 * The id of the folder declared under `key`, the same in every process: two
 * processes declaring one key at once write one folder and one record instead
 * of two. The tenant is part of it because ids are unique across tenant
 * instances. Shaped as a version 8 UUID, like the ids the database gives
 * other rows.
 */
export function declaredFolderId(tenantId: string, key: string): string {
  const hex = createHash("sha256")
    .update(JSON.stringify(["dms-media:declared-folder", tenantId, key]))
    .digest("hex");
  const variant = ((Number.parseInt(hex.charAt(16), 16) % 4) + 8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

/** The declared folder key a parent names, written as a string or as `{ key }`. */
function parentKeyOf(parent: ParentTarget | undefined): string | undefined {
  if (isString(parent)) return parent;
  return parent && "key" in parent ? parent.key : undefined;
}

/**
 * The folder declared under `key`. Throws when no module declared it, since
 * that is a mistake in the calling code, or when it was deleted since.
 */
export async function findDeclaredFolder(
  models: DeclaredModels,
  key: string,
  fail: (reason: string) => never,
): Promise<MediaFolder> {
  await settlePendingDeclaration(models.tenantId, "folder", key);
  const record = await models.declarationModel.findByKey("folder", key);
  if (!record)
    fail(
      `'${key}' is not a declared folder: declare it with EnsureMediaFolder first`,
    );
  const folder = await models.folderModel.get(record.targetId);
  if (!folder) fail(`the folder declared as '${key}' was deleted`);
  return folder;
}

/** The folder bound to an asset field, provisioned like the dashboard does. */
export async function findBoundFolder(
  models: DeclaredModels,
  binding: string,
  fail: (reason: string) => never,
): Promise<MediaFolder> {
  await ensureTenantBindings(models.tenantId, models.folderModel);
  const folder = await models.folderModel.getByBinding(binding);
  if (!folder)
    fail(
      `no folder is bound to '${binding}': register the binding with AssetType or RegisterAssetBinding first`,
    );
  return folder;
}

async function findParentFolder(
  models: DeclaredModels,
  parent: ParentTarget,
  fail: (reason: string) => never,
): Promise<MediaFolder> {
  if (isString(parent)) return findDeclaredFolder(models, parent, fail);
  if ("key" in parent) return findDeclaredFolder(models, parent.key, fail);
  const { binding } = parent;
  const folder = await findBoundFolder(models, binding, fail);
  if (!bindingHoldsSubfolders(binding))
    fail(
      `the folder linked to '${binding}' cannot hold subfolders: register its binding with subfolders: true`,
    );
  return folder;
}

async function createFolder(
  models: DeclaredModels,
  declaration: DeclaredFolderInput,
  parent: MediaFolder | undefined,
): Promise<MediaDeclarationResult> {
  const id = declaredFolderId(models.tenantId, declaration.key);
  const missing = new MediaDeclarationError(
    "folder",
    declaration.key,
    "the folder could not be created",
  );
  const folders = await models.folderModel.getAll();
  if (hasSiblingNamed(folders, declaration.name, parent?._id, id))
    throw new MediaDeclarationError(
      "folder",
      declaration.key,
      `a folder named '${declaration.name}' already exists there`,
    );
  try {
    await models.folderModel.insert({
      _id: id,
      name: declaration.name,
      parentId: parent?._id,
      path: buildChildPath(parent),
      visibility: declaration.visibility,
      json_acl: serializeAcl(declaration.acl),
    });
  } catch (error) {
    if (!IsDuplicateKeyError(error)) throw error;
    if (!(await models.folderModel.get(id))) throw missing;
    return { status: "kept", id };
  }
  const folder = await models.folderModel.get(id);
  if (!folder) throw missing;
  await recordMediaEvent(
    { tenantId: models.tenantId, user: DECLARED_CONTENT_AUTHOR },
    {
      kind: "folder.create",
      targetName: folder.name,
      folderId: parent?._id,
      details: { targetId: folder._id },
    },
  );
  return { status: "created", id };
}

async function applyFolderDeclaration(
  declaration: DeclaredFolderInput,
): Promise<MediaDeclarationResult> {
  const models = declaredModels(declaration.tenantId);
  const record = await models.declarationModel.findByKey(
    "folder",
    declaration.key,
  );
  if (record) return { status: "kept", id: record.targetId };
  const fail = (reason: string): never => {
    throw new MediaDeclarationError("folder", declaration.key, reason);
  };
  const parent = declaration.parent
    ? await findParentFolder(models, declaration.parent, fail)
    : undefined;
  const result = await createFolder(models, declaration, parent);
  await rememberDeclaredFolder(models, declaration.key, result.id);
  return result;
}

/**
 * Records the declared folder under its key. The record takes the folder's
 * fixed id, so a record another process wrote first is this same record.
 */
async function rememberDeclaredFolder(
  models: DeclaredModels,
  key: string,
  folderId: string,
): Promise<void> {
  try {
    await models.declarationModel.insert({
      _id: folderId,
      kind: "folder",
      key,
      targetId: folderId,
    });
  } catch (error) {
    if (!IsDuplicateKeyError(error)) throw error;
  }
}

/** Implements `EnsureMediaFolder`. */
export async function ensureDeclaredFolder(
  input: MediaFolderDeclaration,
): Promise<MediaDeclarationResult> {
  const declaration = parseDeclaration("folder", input, declaredFolderSchema);
  if (parentKeyOf(declaration.parent) === declaration.key)
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
