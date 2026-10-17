import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DeleteFile } from "@antelopejs/interface-file-storage";
import type {
  MediaAssetDeclaration,
  MediaDeclarationResult,
} from "@antelopejs/interface-dms-media";
import { cleanupAssetFiles, updateAssetMedia } from "../asset-lifecycle";
import { ensureTenantBindings } from "../bindings";
import { getMediaConfig } from "../config";
import type { MediaAsset, MediaDeclaration, MediaFolder } from "../db";
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
import { findDeclaredFolder } from "./folders";
import { waitForTenant, writeWhenReachable } from "./readiness";
import {
  DECLARED_CONTENT_AUTHOR,
  type DeclaredModels,
  declaredModels,
  hashBytes,
  hashState,
  judgeDeclaredRow,
  MediaDeclarationError,
  parseDeclaration,
  saveDeclaration,
  withDeclarationLock,
} from "./records";

/** A declared file and the folder it goes to. */
interface AssetTarget {
  models: DeclaredModels;
  declaration: DeclaredAssetInput;
  folder: MediaFolder;
}

/** A declared file's bytes, checked against the library's rules. */
interface PreparedFile {
  bytes: Buffer;
  mimetype: string;
  image: ImageProbe;
}

interface AssetHashes {
  declaredHash: string;
  contentHash: string;
}

type Fail = (reason: string) => never;

/** The member-editable state of a file: its name, folder, alt text, visibility and content. */
function assetStateHash(asset: MediaAsset): string {
  return hashState({
    name: asset.name,
    folderId: asset.folderId,
    alt: asset.alt || null,
    visibility: asset.visibility,
    storageKey: asset.storageKey,
  });
}

function assetHashes(
  declaration: DeclaredAssetInput,
  bytes: Buffer,
): AssetHashes {
  const contentHash = hashBytes(bytes);
  const declaredHash = hashState({
    name: declaration.name,
    folder: declaration.folder,
    alt: declaration.alt ?? null,
    mimetype: declaration.mimetype,
    content: contentHash,
  });
  return { declaredHash, contentHash };
}

async function readSource(
  declaration: DeclaredAssetInput,
  fail: Fail,
): Promise<Buffer> {
  const { source } = declaration;
  const bytes =
    "bytes" in source
      ? Buffer.from(source.bytes)
      : await readFile(source.filePath).catch((error: unknown) =>
          fail(
            `cannot read '${source.filePath}': ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
  const size = declaredFileSizeSchema.safeParse(bytes.byteLength);
  if (!size.success) fail(describeDeclarationIssues(size.error));
  return bytes;
}

/** The folder bound to an asset field, provisioned like the dashboard does. */
async function findBoundFolder(
  models: DeclaredModels,
  binding: string,
  fail: Fail,
): Promise<MediaFolder> {
  await ensureTenantBindings(models.tenantId, models.folderModel);
  const folder = await models.folderModel.getByBinding(binding);
  if (!folder)
    fail(
      `no folder is bound to '${binding}': register the binding with AssetType or RegisterAssetBinding first`,
    );
  return folder;
}

async function findTargetFolder(
  models: DeclaredModels,
  declaration: DeclaredAssetInput,
  fail: Fail,
): Promise<MediaFolder | undefined> {
  const target = declaration.folder;
  if ("binding" in target) return findBoundFolder(models, target.binding, fail);
  return (await findDeclaredFolder(models, target.key, fail)).folder;
}

/** The checks of the upload routes: type, field type, quota and image decoding. */
async function prepareFile(
  { models, declaration, folder }: AssetTarget,
  bytes: Buffer,
  replacedSize: number,
): Promise<PreparedFile> {
  assertUploadTypeAllowed(folder, declaration.name, declaration.mimetype);
  await assertWithinQuota(
    models.assetModel,
    Math.max(bytes.byteLength - replacedSize, 0),
  );
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
  return writeWhenReachable(() =>
    uploadStorageBytes(
      file.bytes,
      declaration.name,
      file.mimetype,
      `media/${models.tenantId}/${folder._id}`,
      getMediaConfig().storage,
    ),
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

/** Publishes metadata and optional new bytes together, only while the file is untouched. */
async function refreshAsset(
  target: AssetTarget,
  asset: MediaAsset,
  bytes: Buffer,
  isContentChanged: boolean,
): Promise<MediaAsset | undefined> {
  const { models, declaration, folder } = target;
  const { assetModel } = models;
  const patch: Partial<MediaAsset> = {
    name: declaration.name,
    folderId: folder._id,
    alt: declaration.alt ?? "",
  };
  let storageKey: string | undefined;
  if (isContentChanged) {
    const file = await prepareFile(target, bytes, asset.size);
    storageKey = await writeFile(target, file);
    Object.assign(patch, {
      storageKey,
      mimetype: file.mimetype,
      size: file.bytes.byteLength,
      width: file.image.width,
      height: file.image.height,
      json_derivatives: "",
    });
  } else {
    assertUploadTypeAllowed(folder, declaration.name, asset.mimetype);
  }
  for (;;) {
    const fresh = await assetModel.get(asset._id);
    const isStillAsDeclared =
      fresh !== undefined &&
      !fresh.isDeleting &&
      assetStateHash(fresh) === assetStateHash(asset);
    if (!isStillAsDeclared) {
      if (storageKey)
        await DeleteFile(storageKey, getMediaConfig().storage).catch(
          () => undefined,
        );
      return undefined;
    }
    if (
      await updateAssetMedia(assetModel, fresh, patch, {
        preserveDetails: true,
      })
    )
      break;
  }
  if (storageKey) await cleanupAssetFiles(assetModel, asset._id);
  // A concurrent edit after publication must not become our new baseline.
  return Object.assign(asset, patch);
}

function rememberAsset(
  target: AssetTarget,
  record: MediaDeclaration | undefined,
  asset: MediaAsset,
  hashes: AssetHashes,
): Promise<void> {
  return saveDeclaration(target.models.declarationModel, record, {
    kind: "asset",
    key: target.declaration.key,
    targetId: asset._id,
    appliedHash: assetStateHash(asset),
    ...hashes,
  });
}

async function applyAssetDeclaration(
  declaration: DeclaredAssetInput,
): Promise<MediaDeclarationResult> {
  const fail: Fail = (reason) => {
    throw new MediaDeclarationError("asset", declaration.key, reason);
  };
  const bytes = await readSource(declaration, fail);
  await waitForTenant(declaration.tenantId);
  const models = declaredModels(declaration.tenantId);
  const hashes = assetHashes(declaration, bytes);
  const record = await models.declarationModel.findByKey(
    "asset",
    declaration.key,
  );
  const stored = record && (await models.assetModel.get(record.targetId));
  const asset = stored && !stored.isDeleting ? stored : undefined;
  const verdict =
    record &&
    judgeDeclaredRow(
      record,
      asset,
      asset && assetStateHash(asset),
      hashes.declaredHash,
    );
  if (verdict) return verdict;
  const folder = await findTargetFolder(models, declaration, fail);
  // A file whose declared folder a member deleted went with it, or never came.
  if (!folder)
    return asset
      ? { status: "preserved", id: asset._id }
      : { status: "deleted" };
  const target: AssetTarget = { models, declaration, folder };
  if (!record || !asset) {
    const file = await prepareFile(target, bytes, 0);
    const created = await createAsset(target, file);
    await rememberAsset(target, record, created, hashes);
    return { status: "created", id: created._id };
  }
  const isContentChanged = record.contentHash !== hashes.contentHash;
  const refreshed = await refreshAsset(target, asset, bytes, isContentChanged);
  if (!refreshed) {
    const current = await models.assetModel.get(asset._id);
    return current && !current.isDeleting
      ? { status: "preserved", id: asset._id }
      : { status: "deleted" };
  }
  await rememberAsset(target, record, refreshed, hashes);
  return { status: "updated", id: refreshed._id };
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
