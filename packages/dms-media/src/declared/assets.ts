import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DeleteFile } from "@antelopejs/interface-file-storage";
import type {
  MediaAssetDeclaration,
  MediaDeclarationResult,
} from "@antelopejs/interface-dms-media";
import { feedingBinding } from "../bindings";
import { getMediaConfig } from "../config";
import type { MediaAsset, MediaFolder } from "../db";
import { uploadStorageBytes } from "../derivatives";
import { recordMediaEvent } from "../library/events";
import {
  assertReadableImage,
  assertUploadTypeAllowed,
  assertWithinQuota,
  type ImageProbe,
  probeImageBytes,
  UploadRefusedError,
} from "../upload-checks";
import { mimetypeOfFormat } from "../upload-policy";
import {
  declaredAssetSchema,
  type DeclaredAssetInput,
  declaredFileSizeSchema,
  describeDeclarationIssues,
} from "../validation/declared.schema";
import { findBoundFolder, findDeclaredFolder } from "./folders";
import {
  DECLARED_CONTENT_AUTHOR,
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

/** A declared file's bytes, checked against the library's rules. */
interface PreparedFile {
  bytes: Buffer;
  mimetype: string;
  image: ImageProbe;
}

type Fail = (reason: string) => never;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadBytes(
  load: () => Uint8Array | Promise<Uint8Array>,
  fail: Fail,
): Promise<Buffer> {
  const loaded: unknown = await Promise.resolve()
    .then(load)
    .catch((error: unknown) =>
      fail(`the source failed to load: ${describeError(error)}`),
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
      fail(`cannot read '${source.filePath}': ${describeError(error)}`),
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

/** The checks of the upload routes: type, field type, quota and image decoding. */
async function prepareFile(
  { models, declaration, fieldBinding }: AssetTarget,
  bytes: Buffer,
): Promise<PreparedFile> {
  assertUploadTypeAllowed(fieldBinding, declaration.name, declaration.mimetype);
  await assertWithinQuota(models.assetModel, bytes.byteLength);
  const image = await probeImageBytes(
    async () => bytes,
    declaration.mimetype,
    bytes.byteLength,
  );
  assertReadableImage(image, declaration.mimetype);
  return {
    bytes,
    mimetype: mimetypeOfFormat(image.format) ?? declaration.mimetype,
    image,
  };
}

function writeFile(
  { models, declaration, folder }: AssetTarget,
  file: PreparedFile,
): Promise<string> {
  return uploadStorageBytes(
    file.bytes,
    declaration.name,
    file.mimetype,
    `media/${models.tenantId}/${folder._id}`,
    getMediaConfig().storage,
  );
}

async function insertAsset(
  { models, declaration, folder }: AssetTarget,
  file: PreparedFile,
  storageKey: string,
): Promise<MediaAsset | undefined> {
  const [assetId] = await models.assetModel.insert({
    folderId: folder._id,
    mediaRevision: randomUUID(),
    json_retiredFiles: "[]",
    name: declaration.name,
    mimetype: file.mimetype,
    size: file.bytes.byteLength,
    storageKey,
    storage: getMediaConfig().storage,
    width: file.image.width,
    height: file.image.height,
    alt: declaration.alt,
    visibility: "inherit",
    createdBy: DECLARED_CONTENT_AUTHOR._id,
  });
  return models.assetModel.get(assetId);
}

async function createAsset(
  target: AssetTarget,
  file: PreparedFile,
): Promise<MediaAsset> {
  const storageKey = await writeFile(target, file);
  const discardFile = () =>
    DeleteFile(storageKey, getMediaConfig().storage).catch(() => undefined);
  const asset = await insertAsset(target, file, storageKey).catch(
    async (error: unknown) => {
      await discardFile();
      throw error;
    },
  );
  if (!asset) {
    await discardFile();
    throw new MediaDeclarationError(
      "asset",
      target.declaration.key,
      "the file could not be created",
    );
  }
  await recordMediaEvent(
    { tenantId: target.models.tenantId, user: DECLARED_CONTENT_AUTHOR },
    {
      kind: "asset.upload",
      targetName: asset.name,
      folderId: asset.folderId,
      assetId: asset._id,
      size: asset.size,
    },
  );
  return asset;
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
  const file = await prepareFile(target, await readSource(declaration, fail));
  const asset = await createAsset(target, file);
  await rememberDeclaration(models, "asset", declaration.key, asset._id);
  return { status: "created", id: asset._id };
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
