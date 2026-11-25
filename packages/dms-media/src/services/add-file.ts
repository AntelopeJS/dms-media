import { randomUUID } from "node:crypto";
import { IsDuplicateKeyError } from "@antelopejs/interface-database";
import { DeleteFile } from "@antelopejs/interface-file-storage";
import { getMediaConfig } from "../config";
import type { MediaAsset, MediaAssetModel, MediaFolder } from "../db";
import { uploadStorageBytes } from "../derivatives";
import {
  type MediaEventActor,
  type MediaFileSource,
  recordMediaEvent,
} from "../library/events";
import {
  assertUploadTypeAllowed,
  assertWithinQuota,
  type ImageProbe,
  probeImage,
} from "../upload-checks";
import { mimetypeOfFormat } from "../upload-policy";

/** A file's bytes, checked against the library's rules. */
export interface PreparedFile {
  bytes: Buffer;
  mimetype: string;
  image: ImageProbe;
}

/** What a new file is checked against: the library, the field its folder feeds, the quota. */
export interface FileCheck {
  assetModel: MediaAssetModel;
  fieldBinding?: string;
  name: string;
  mimetype: string;
}

/** Where and as whom a new file is stored. */
export interface NewFileTarget {
  tenantId: string;
  assetModel: MediaAssetModel;
  folder: MediaFolder;
  name: string;
  alt?: string;
  createdBy: string;
  /** The row id; a fixed one makes two processes adding the same file write one row. */
  id: string;
}

/** The stored row, and whether this call inserted it or another one had. */
export interface StoredFile {
  asset?: MediaAsset;
  inserted: boolean;
}

/**
 * The checks of the upload routes: type, field type, quota and image
 * decoding. Throws `UploadRefusedError` for a refused file.
 */
export async function prepareFile(
  check: FileCheck,
  bytes: Buffer,
): Promise<PreparedFile> {
  assertUploadTypeAllowed(check.fieldBinding, check.name, check.mimetype);
  await assertWithinQuota(check.assetModel, bytes.byteLength);
  const image = await probeImage(
    async () => bytes,
    check.mimetype,
    bytes.byteLength,
  );
  return {
    bytes,
    mimetype: mimetypeOfFormat(image.format) ?? check.mimetype,
    image,
  };
}

async function insertAsset(
  target: NewFileTarget,
  file: PreparedFile,
  storageKey: string,
): Promise<boolean> {
  try {
    await target.assetModel.insert({
      _id: target.id,
      folderId: target.folder._id,
      mediaRevision: randomUUID(),
      json_retiredFiles: "[]",
      name: target.name,
      mimetype: file.mimetype,
      size: file.bytes.byteLength,
      storageKey,
      storage: getMediaConfig().storage,
      width: file.image.width,
      height: file.image.height,
      alt: target.alt,
      visibility: "inherit",
      createdBy: target.createdBy,
    });
    return true;
  } catch (error) {
    if (!IsDuplicateKeyError(error)) throw error;
    return false;
  }
}

/**
 * Stores the file and inserts its asset. A process that loses the insert to
 * another one adding the same id deletes its own file and keeps theirs.
 */
export async function storeNewFile(
  target: NewFileTarget,
  file: PreparedFile,
): Promise<StoredFile> {
  const storage = getMediaConfig().storage;
  const storageKey = await uploadStorageBytes(
    file.bytes,
    target.name,
    file.mimetype,
    `media/${target.tenantId}/${target.folder._id}`,
    storage,
  );
  const discardFile = () =>
    DeleteFile(storageKey, storage).catch(() => undefined);
  const inserted = await insertAsset(target, file, storageKey).catch(
    async (error: unknown) => {
      await discardFile();
      throw error;
    },
  );
  const asset = await target.assetModel.get(target.id);
  if (!inserted || !asset) await discardFile();
  return { asset, inserted };
}

/** Records a file added to the library, for the activity and the triggers. */
export async function recordAddedFile(
  actor: MediaEventActor,
  asset: MediaAsset,
  source: MediaFileSource,
  foldersById?: ReadonlyMap<string, MediaFolder>,
): Promise<void> {
  await recordMediaEvent(
    actor,
    {
      kind: "asset.upload",
      targetName: asset.name,
      folderId: asset.folderId,
      assetId: asset._id,
      size: asset.size,
    },
    { assets: [asset], foldersById, source },
  );
}
