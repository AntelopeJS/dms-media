import { WaitForTenantInstance } from "@antelopejs/interface-dms/tenant-instances";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DeleteFile } from "@antelopejs/interface-file-storage";
import type {
  MediaAssetDeclaration,
  MediaDeclarationResult,
} from "@antelopejs/interface-dms-media";
import { cleanupAssetFiles, updateAssetMedia } from "../asset-lifecycle";
import { feedingBinding } from "../bindings";
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
import { findBoundFolder, findDeclaredFolder } from "./folders";
import {
  DECLARED_CONTENT_AUTHOR,
  type DeclaredModels,
  declaredModels,
  hashBytes,
  hashState,
  judgeDeclaredRow,
  judgeMemberChange,
  MediaDeclarationError,
  parseDeclaration,
  saveDeclaration,
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

interface AssetHashes {
  declaredHash: string;
  contentHash: string;
}

type Fail = (reason: string) => never;

/** The member-editable state of a file: its name, folder, alt text, visibility and content. */
export function assetStateHash(asset: MediaAsset): string {
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
  contentHash: string,
): AssetHashes {
  const declaredHash = hashState({
    name: declaration.name,
    folder: declaration.folder,
    alt: declaration.alt ?? null,
    mimetype: declaration.mimetype,
    content: contentHash,
  });
  return { declaredHash, contentHash };
}

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

/**
 * A declared file's bytes, read at most once and only when a decision needs
 * them: generating or reading content every boot is what `version` and lazy
 * sources let callers avoid.
 */
class DeclaredContent {
  private bytes?: Promise<Buffer>;

  constructor(
    private readonly declaration: DeclaredAssetInput,
    private readonly fail: Fail,
  ) {}

  read(): Promise<Buffer> {
    this.bytes ??= readSource(this.declaration, this.fail);
    return this.bytes;
  }

  /** The bytes' hash, taken from the last declaration while the caller's version still matches it. */
  async hash(record: MediaDeclaration | undefined): Promise<string> {
    const { version } = this.declaration;
    if (version && record?.contentHash && record.version === version)
      return record.contentHash;
    return hashBytes(await this.read());
  }
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
): Promise<MediaFolder | undefined> {
  const target = declaration.folder;
  if ("binding" in target) return findBoundFolder(models, target.binding, fail);
  return (await findDeclaredFolder(models, target.key, fail)).folder;
}

/** The checks of the upload routes: type, field type, quota and image decoding. */
async function prepareFile(
  { models, declaration, fieldBinding }: AssetTarget,
  bytes: Buffer,
  replacedSize: number,
): Promise<PreparedFile> {
  assertUploadTypeAllowed(fieldBinding, declaration.name, declaration.mimetype);
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

/** Publishes metadata and optional new bytes together, only while the file is untouched. */
async function refreshAsset(
  target: AssetTarget,
  asset: MediaAsset,
  content: DeclaredContent,
  isContentChanged: boolean,
): Promise<MediaAsset | undefined> {
  const { models, declaration, folder, fieldBinding } = target;
  const { assetModel } = models;
  const patch: Partial<MediaAsset> = {
    name: declaration.name,
    folderId: folder._id,
    alt: declaration.alt ?? "",
  };
  let storageKey: string | undefined;
  if (isContentChanged) {
    const file = await prepareFile(target, await content.read(), asset.size);
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
    assertUploadTypeAllowed(fieldBinding, declaration.name, asset.mimetype);
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
    version: target.declaration.version ?? "",
    ...hashes,
  });
}

/** Remembers a new caller version of unchanged bytes, so the next boot does not read them again. */
async function rememberVersion(
  models: DeclaredModels,
  record: MediaDeclaration,
  version: string | undefined,
): Promise<void> {
  if (!version || record.version === version) return;
  await models.declarationModel.update(record._id, { version });
}

async function applyAssetDeclaration(
  declaration: DeclaredAssetInput,
): Promise<MediaDeclarationResult> {
  const fail: Fail = (reason) => {
    throw new MediaDeclarationError("asset", declaration.key, reason);
  };
  const content = new DeclaredContent(declaration, fail);
  await WaitForTenantInstance(declaration.tenantId);
  const models = declaredModels(declaration.tenantId);
  const record = await models.declarationModel.findByKey(
    "asset",
    declaration.key,
  );
  const stored = record && (await models.assetModel.get(record.targetId));
  const asset = stored && !stored.isDeleting ? stored : undefined;
  // Deleted or changed by a member: the new content cannot matter, so it is not read.
  const change =
    record && judgeMemberChange(record, asset, asset && assetStateHash(asset));
  if (change) return change;
  const hashes = assetHashes(declaration, await content.hash(record));
  const verdict =
    record &&
    judgeDeclaredRow(
      record,
      asset,
      asset && assetStateHash(asset),
      hashes.declaredHash,
    );
  if (verdict) {
    if (record) await rememberVersion(models, record, declaration.version);
    return verdict;
  }
  const folder = await findTargetFolder(models, declaration, fail);
  // A file whose declared folder a member deleted went with it, or never came.
  if (!folder)
    return asset
      ? { status: "preserved", id: asset._id }
      : { status: "deleted" };
  const target: AssetTarget = {
    models,
    declaration,
    folder,
    fieldBinding: await fieldBindingOf(models, folder),
  };
  if (!record || !asset) {
    const file = await prepareFile(target, await content.read(), 0);
    const created = await createAsset(target, file);
    await rememberAsset(target, record, created, hashes);
    return { status: "created", id: created._id };
  }
  const isContentChanged = record.contentHash !== hashes.contentHash;
  const refreshed = await refreshAsset(
    target,
    asset,
    content,
    isContentChanged,
  );
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
