import { MediaApiController } from "./controller";
import { randomUUID } from "node:crypto";
import { HTTPResult, JSONBody, Post } from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import {
  CreateReadUrl,
  CreateUploadUrl,
  DeleteFile,
  type FileMetadata,
  GetFileMetadata,
  isStagedKey,
  PromoteFile,
} from "@antelopejs/interface-file-storage";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import sharp from "sharp";
import { getRegisteredBindings } from "../../bindings";
import { getMediaConfig } from "../../config";
import { ORIGINAL_FILENAME_METADATA_KEY } from "../../constants";
import { MediaUploadModel } from "../../db";
import { loadAssetsInFolders } from "../../library/listing";
import { suggestFreeNames } from "../../upload-names";
import {
  expectedImageFormat,
  isUploadTypeAllowed,
  mimetypeMatches,
  mimetypeOfFormat,
} from "../../upload-policy";
import {
  confirmUploadSchema,
  presignSchema,
} from "../../validation/media.schema";
import {
  abortUploadSchema,
  uploadNamesSchema,
} from "../../validation/upload.schema";
import { type MediaRequestContext, requireFolderRight } from "./context";
import { buildAssetDto } from "./dto";

const HTTP_BAD_REQUEST = 400;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_UNPROCESSABLE_ENTITY = 422;
// Dimension probing buffers the file in memory, so skip files too large to
// hold in the heap; they simply stay without width/height metadata.
const MAX_PROBE_SIZE_BYTES = 32 * 1024 * 1024;
const FIRST_SWAPPED_ORIENTATION = 5;

/** Why an upload is refused, for the queue to explain it in the member's language. */
export type UploadRefusal =
  | "type_not_allowed"
  | "field_type"
  | "quota"
  | "invalid_image";

function refuse(
  status: number,
  reason: UploadRefusal,
  message: string,
  details: Record<string, unknown> = {},
): never {
  throw new HTTPResult(status, { reason, message, ...details });
}

function mediaUploadPath(tenantId: string, folderId: string): string {
  return `media/${tenantId}/${folderId}`;
}

interface ImageProbe {
  width?: number;
  height?: number;
  format?: string;
  isReadable: boolean;
}

async function readStoredFile(
  storageKey: string,
  storage: string | undefined,
): Promise<Buffer | undefined> {
  const readUrl = await CreateReadUrl(storageKey, undefined, storage);
  const response = await fetch(readUrl.url);
  if (!response.ok) return undefined;
  return Buffer.from(await response.arrayBuffer());
}

/** Displayed size: sharp reports stored pixels, EXIF orientations 5-8 swap them. */
function orientedSize(metadata: sharp.Metadata): ImageProbe {
  const isSwapped = (metadata.orientation ?? 0) >= FIRST_SWAPPED_ORIENTATION;
  return {
    width: isSwapped ? metadata.height : metadata.width,
    height: isSwapped ? metadata.width : metadata.height,
    format: metadata.format,
    isReadable: true,
  };
}

async function probeImage(
  storageKey: string,
  storage: string | undefined,
  mimetype: string,
  size: number,
): Promise<ImageProbe> {
  if (!mimetype.startsWith("image/") || size > MAX_PROBE_SIZE_BYTES)
    return { isReadable: true };
  try {
    const buffer = await readStoredFile(storageKey, storage);
    if (!buffer) return { isReadable: true };
    return orientedSize(await sharp(buffer).metadata());
  } catch {
    return { isReadable: false };
  }
}

function assertTypeAllowed(
  context: MediaRequestContext,
  folderId: string,
  filename: string,
  mimetype: string,
): void {
  if (!isUploadTypeAllowed(filename, mimetype))
    refuse(
      HTTP_UNSUPPORTED_MEDIA_TYPE,
      "type_not_allowed",
      "This type of file can't be added to the library",
    );
  const binding = context.foldersById.get(folderId)?.binding;
  const accepted = getRegisteredBindings().find(
    (config) => config.id === binding,
  )?.field?.mimetypes;
  if (accepted?.length && !mimetypeMatches(mimetype, accepted))
    refuse(
      HTTP_UNSUPPORTED_MEDIA_TYPE,
      "field_type",
      `This folder feeds a field that only accepts ${accepted.join(", ")}`,
      { accepted },
    );
}

async function assertWithinQuota(
  context: MediaRequestContext,
  size: number,
): Promise<void> {
  const quota = getMediaConfig().storageQuotaBytes;
  if (!quota) return;
  const assets = await loadAssetsInFolders(
    context.assetModel,
    context.folders.map((folder) => folder._id),
  );
  const used = assets.reduce((total, asset) => total + asset.size, 0);
  if (used + size > quota)
    refuse(
      HTTP_PAYLOAD_TOO_LARGE,
      "quota",
      "The library's storage plan is full",
      { remaining: Math.max(quota - used, 0), quota },
    );
}

async function readImage(
  resourceKey: string,
  metadata: FileMetadata,
): Promise<ImageProbe> {
  const probe = await probeImage(
    resourceKey,
    getMediaConfig().storage,
    metadata.mimetype,
    metadata.size,
  );
  const isDecodable = Boolean(expectedImageFormat(metadata.mimetype));
  if (isDecodable && (!probe.isReadable || !probe.format))
    refuse(
      HTTP_UNPROCESSABLE_ENTITY,
      "invalid_image",
      "This file is not a readable image",
    );
  return probe;
}

export class MediaUploadController extends MediaApiController {
  @TenantScopedModel(MediaUploadModel)
  declare uploadModel: MediaUploadModel;

  @Post("/upload/presign")
  async presign(@JSONBody() body: unknown) {
    const { folderId, filename, size, mimetype } = assertValidation(body, (v) =>
      presignSchema.parse(v),
    );
    const context = await this.resolveContext();
    requireFolderRight(context, folderId, "write");
    assertTypeAllowed(context, folderId, filename, mimetype);
    await assertWithinQuota(context, size);
    const storage = getMediaConfig().storage;
    const presigned = await CreateUploadUrl(
      {
        filename,
        size,
        mimetype,
        path: mediaUploadPath(context.tenantId, folderId),
        metadata: { [ORIGINAL_FILENAME_METADATA_KEY]: filename },
        staging: true,
      },
      undefined,
      storage,
    );
    await this.uploadModel.insert({
      resourceKey: presigned.resourceKey,
      storage,
    });
    return presigned;
  }

  /** Free names for files about to land in a folder, for "Keep both". */
  @Post("/upload/names")
  async names(@JSONBody() body: unknown) {
    const { folderId, filenames } = assertValidation(body, (v) =>
      uploadNamesSchema.parse(v),
    );
    const context = await this.resolveContext();
    requireFolderRight(context, folderId, "write");
    const assets = await loadAssetsInFolders(context.assetModel, [folderId]);
    return {
      names: suggestFreeNames(
        assets.map((asset) => asset.name),
        filenames,
      ),
    };
  }

  @Post("/upload/abort")
  async abort(@JSONBody() body: unknown) {
    const { folderId, resourceKey } = assertValidation(body, (v) =>
      abortUploadSchema.parse(v),
    );
    const context = await this.resolveContext();
    this.assertStagedFor(context, folderId, resourceKey);
    if (context.foldersById.has(folderId))
      requireFolderRight(context, folderId, "write");
    await this.discardStaged(resourceKey);
    return { ok: true };
  }

  @Post("/upload/confirm")
  async confirm(@JSONBody() body: unknown) {
    const { folderId, resourceKey, filename, batchId } = assertValidation(
      body,
      (v) => confirmUploadSchema.parse(v),
    );
    const context = await this.resolveContext();
    this.assertStagedFor(context, folderId, resourceKey);
    try {
      return await this.createAsset(context, {
        folderId,
        resourceKey,
        filename,
        batchId,
      });
    } catch (error) {
      if (this.mayDiscard(context, folderId))
        await this.discardStaged(resourceKey);
      throw error;
    }
  }

  private assertStagedFor(
    context: MediaRequestContext,
    folderId: string,
    resourceKey: string,
  ): void {
    assert(
      isStagedKey(resourceKey),
      HTTP_BAD_REQUEST,
      "resourceKey is not a staged upload",
    );
    const folderPath = `${mediaUploadPath(context.tenantId, folderId)}/`;
    assert(
      resourceKey.startsWith(folderPath) ||
        resourceKey.includes(`/${folderPath}`),
      HTTP_BAD_REQUEST,
      "resourceKey was not presigned for this folder",
    );
  }

  /** A deleted folder or a writer's own failed upload: nobody else's file. */
  private mayDiscard(context: MediaRequestContext, folderId: string): boolean {
    return (
      !context.foldersById.has(folderId) ||
      context.access.writable.has(folderId)
    );
  }

  private async discardStaged(resourceKey: string): Promise<void> {
    await DeleteFile(resourceKey, getMediaConfig().storage).catch(
      () => undefined,
    );
    await this.uploadModel.forgetKey(resourceKey);
  }

  private async createAsset(context: MediaRequestContext, input: ConfirmInput) {
    const { folderId, resourceKey, filename, batchId } = input;
    requireFolderRight(context, folderId, "write");
    const storage = getMediaConfig().storage;
    const metadata = await GetFileMetadata(resourceKey, storage);
    assertTypeAllowed(context, folderId, filename, metadata.mimetype);
    const image = await readImage(resourceKey, metadata);
    const promoted = await PromoteFile(resourceKey, storage);
    await this.uploadModel.forgetKey(resourceKey);
    const [assetId] = await context.assetModel.insert({
      folderId,
      mediaRevision: randomUUID(),
      json_retiredFiles: "[]",
      name: filename,
      mimetype: mimetypeOfFormat(image.format) ?? metadata.mimetype,
      size: metadata.size,
      storageKey: promoted.resourceKey,
      storage,
      width: image.width,
      height: image.height,
      visibility: "inherit",
      createdBy: context.user._id,
    });
    const asset = await context.assetModel.get(assetId);
    assert(asset, HTTP_BAD_REQUEST, "Asset creation failed");
    await this.record(context, {
      kind: "asset.upload",
      targetName: asset.name,
      folderId,
      assetId,
      size: asset.size,
      details: batchId ? { batchId } : undefined,
    });
    return { asset: buildAssetDto(context, asset) };
  }
}

interface ConfirmInput {
  folderId: string;
  resourceKey: string;
  filename: string;
  batchId?: string;
}
