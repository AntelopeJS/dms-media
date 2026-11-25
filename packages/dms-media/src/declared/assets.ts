import { readFile } from "node:fs/promises";
import type {
  MediaAssetDeclaration,
  MediaDeclarationResult,
} from "@antelopejs/interface-dms-media";
import { feedingBinding } from "../bindings";
import type { MediaFolder } from "../db";
import {
  type PreparedFile,
  prepareFile,
  recordAddedFile,
  storeNewFile,
} from "../services/add-file";
import { UploadRefusedError } from "../upload-checks";
import {
  declaredAssetSchema,
  type DeclaredAssetInput,
  declaredFileSizeSchema,
  describeDeclarationIssues,
} from "../validation/declared.schema";
import { findBoundFolder, findDeclaredFolder } from "./folders";
import {
  DECLARED_CONTENT_AUTHOR,
  declaredId,
  type DeclaredModels,
  declaredModels,
  MediaDeclarationError,
  parseDeclaration,
  rememberDeclaration,
  withDeclarationLock,
} from "./records";

/** A declared file, the folder it goes to and the binding whose field that folder feeds. */
interface AssetTarget {
  models: DeclaredModels;
  declaration: DeclaredAssetInput;
  folder: MediaFolder;
  fieldBinding?: string;
}

type Fail = (reason: string) => never;

async function loadBytes(
  load: () => Uint8Array | Promise<Uint8Array>,
  fail: Fail,
): Promise<Buffer> {
  const loaded: unknown = await Promise.resolve()
    .then(load)
    .catch((error: unknown) =>
      fail(
        `the source failed to load: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  if (!(loaded instanceof Uint8Array))
    fail("source.load must return a Uint8Array");
  return Buffer.from(loaded);
}

async function readSource(
  declaration: DeclaredAssetInput,
  fail: Fail,
): Promise<Buffer> {
  const { source } = declaration;
  let bytes: Buffer;
  if ("bytes" in source) bytes = Buffer.from(source.bytes);
  else if ("filePath" in source)
    bytes = await readFile(source.filePath).catch((error: unknown) =>
      fail(
        `cannot read '${source.filePath}': ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  else bytes = await loadBytes(source.load, fail);
  const size = declaredFileSizeSchema.safeParse(bytes.byteLength);
  if (!size.success) fail(describeDeclarationIssues(size.error));
  return bytes;
}

/** The binding whose field the folder feeds, through its linked ancestors when it has no binding itself. */
async function fieldBindingOf(
  models: DeclaredModels,
  folder: MediaFolder,
): Promise<string | undefined> {
  if (folder.binding) return folder.binding;
  const ancestors = await Promise.all(
    folder.path.map((id) => models.folderModel.get(id)),
  );
  const foldersById = new Map(
    ancestors
      .filter((ancestor): ancestor is MediaFolder => ancestor !== undefined)
      .map((ancestor) => [ancestor._id, ancestor]),
  );
  return feedingBinding(folder, foldersById);
}

async function findTargetFolder(
  models: DeclaredModels,
  declaration: DeclaredAssetInput,
  fail: Fail,
): Promise<MediaFolder> {
  const target = declaration.folder;
  if ("binding" in target) return findBoundFolder(models, target.binding, fail);
  return findDeclaredFolder(models, target.key, fail);
}

/**
 * Stores the file and inserts its asset under the declaration's fixed id. A
 * process that loses the insert to another one importing the same key keeps
 * theirs.
 */
async function createAsset(
  target: AssetTarget,
  file: PreparedFile,
): Promise<MediaDeclarationResult> {
  const { models, declaration, folder } = target;
  const id = declaredId(models.tenantId, "asset", declaration.key);
  const { asset, inserted } = await storeNewFile(
    {
      tenantId: models.tenantId,
      assetModel: models.assetModel,
      folder,
      name: declaration.name,
      alt: declaration.alt,
      createdBy: DECLARED_CONTENT_AUTHOR._id,
      id,
    },
    file,
  );
  if (!asset)
    throw new MediaDeclarationError(
      "asset",
      declaration.key,
      "the file could not be created",
    );
  if (!inserted) return { status: "kept", id };
  await recordAddedFile(
    { tenantId: models.tenantId, user: DECLARED_CONTENT_AUTHOR },
    asset,
    "declared",
  );
  return { status: "created", id };
}

async function applyAssetDeclaration(
  declaration: DeclaredAssetInput,
): Promise<MediaDeclarationResult> {
  const models = declaredModels(declaration.tenantId);
  const record = await models.declarationModel.findByKey(
    "asset",
    declaration.key,
  );
  if (record) return { status: "kept", id: record.targetId };
  const fail: Fail = (reason) => {
    throw new MediaDeclarationError("asset", declaration.key, reason);
  };
  const folder = await findTargetFolder(models, declaration, fail);
  const target: AssetTarget = {
    models,
    declaration,
    folder,
    fieldBinding: await fieldBindingOf(models, folder),
  };
  const file = await prepareFile(
    {
      assetModel: models.assetModel,
      fieldBinding: target.fieldBinding,
      name: declaration.name,
      mimetype: declaration.mimetype,
    },
    await readSource(declaration, fail),
  );
  const result = await createAsset(target, file);
  await rememberDeclaration(models, "asset", declaration.key, result.id);
  return result;
}

/** Implements `ImportMediaAsset`. */
export async function importDeclaredAsset(
  input: MediaAssetDeclaration,
): Promise<MediaDeclarationResult> {
  const declaration = parseDeclaration("asset", input, declaredAssetSchema);
  return withDeclarationLock(
    declaration.tenantId,
    "asset",
    declaration.key,
    async () => {
      try {
        return await applyAssetDeclaration(declaration);
      } catch (error) {
        if (!(error instanceof UploadRefusedError)) throw error;
        throw new MediaDeclarationError(
          "asset",
          declaration.key,
          error.message,
        );
      }
    },
  );
}
