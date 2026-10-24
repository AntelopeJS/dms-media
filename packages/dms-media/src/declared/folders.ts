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
import {
  DECLARED_CONTENT_AUTHOR,
  type DeclaredModels,
  declaredModels,
  MediaDeclarationError,
  parseDeclaration,
  rememberDeclaration,
  settlePendingDeclaration,
  withDeclarationLock,
} from "./records";

type ParentTarget = NonNullable<DeclaredFolderInput["parent"]>;

/** The declared folder key a parent names, written as a string or as `{ key }`. */
function parentKeyOf(parent: ParentTarget | undefined): string | undefined {
  if (typeof parent === "string") return parent;
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
  if (typeof parent === "string")
    return findDeclaredFolder(models, parent, fail);
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
  const folder = await createFolder(models, declaration, parent);
  await rememberDeclaration(models, "folder", declaration.key, folder._id);
  return { status: "created", id: folder._id };
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
