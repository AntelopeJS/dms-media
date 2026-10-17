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
import { getMediaConfig } from "../../config";
import { ORIGINAL_FILENAME_METADATA_KEY } from "../../constants";
import { MediaUploadModel } from "../../db";
import { loadAssetsInFolders } from "../../library/listing";
import {
  assertReadableImage,
  assertUploadTypeAllowed,
  assertWithinQuota,
  type ImageProbe,
  probeImageBytes,
  UploadRefusedError,
} from "../../upload-checks";
import { suggestFreeNames } from "../../upload-names";
import { mimetypeOfFormat } from "../../upload-policy";
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

export type { UploadRefusal } from "../../upload-checks";

const HTTP_BAD_REQUEST = 400;

/** Answers a refused file with its reason, for the queue to explain it. */
async function answerRefusal<T>(check: () => T | Promise<T>): Promise<T> {
  try {
    return await check();
  } catch (error) {
    if (!(error instanceof UploadRefusedError)) throw error;
    throw new HTTPResult(error.status, {
      reason: error.reason,
      message: error.message,
      ...error.details,
    });
  }
}

function mediaUploadPath(tenantId: string, folderId: string): string {
  return `media/${tenantId}/${folderId}`;
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

async function readImage(
  resourceKey: string,
  metadata: FileMetadata,
): Promise<ImageProbe> {
  const storage = getMediaConfig().storage;
  const probe = await probeImageBytes(
    () => readStoredFile(resourceKey, storage),
    metadata.mimetype,
    metadata.size,
  );
  assertReadableImage(probe, metadata.mimetype);
  return probe;
}

async function assertUploadAccepted(
  context: MediaRequestContext,
  folderId: string,
  filename: string,
  file: Pick<FileMetadata, "mimetype" | "size">,
): Promise<void> {
  assertUploadTypeAllowed(
    context.foldersById.get(folderId),
    filename,
    file.mimetype,
  );
  await assertWithinQuota(context.assetModel, file.size);
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
    await answerRefusal(() =>
      assertUploadAccepted(context, folderId, filename, { mimetype, size }),
    );
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
    const image = await answerRefusal(async () => {
      await assertUploadAccepted(context, folderId, filename, metadata);
      return readImage(resourceKey, metadata);
    });
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
