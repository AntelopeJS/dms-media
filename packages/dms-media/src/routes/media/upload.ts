import { randomUUID } from "node:crypto";
import {
  Context,
  Controller,
  JSONBody,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import {
  CreateReadUrl,
  CreateUploadUrl,
  GetFileMetadata,
  isStagedKey,
  PromoteFile,
} from "@antelopejs/interface-file-storage";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { AuthTenantMember } from "@antelopejs/interface-dms/guards";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import type { User } from "@antelopejs/interface-dms/auth/db";
import sharp from "sharp";
import { getMediaConfig } from "../../config";
import { ORIGINAL_FILENAME_METADATA_KEY } from "../../constants";
import { MediaAssetModel, MediaFolderModel } from "../../db";
import {
  confirmUploadSchema,
  presignSchema,
} from "../../validation/media.schema";
import {
  type MediaRequestContext,
  requireFolderRight,
  resolveMediaContext,
} from "./context";
import { buildAssetDto } from "./dto";

const HTTP_BAD_REQUEST = 400;
// Dimension probing buffers the file in memory, so skip files too large to
// hold in the heap; they simply stay without width/height metadata.
const MAX_PROBE_SIZE_BYTES = 32 * 1024 * 1024;

function mediaUploadPath(tenantId: string, folderId: string): string {
  return `media/${tenantId}/${folderId}`;
}

interface ImageDimensions {
  width?: number;
  height?: number;
}

export async function probeImageDimensions(
  storageKey: string,
  storage: string | undefined,
  mimetype: string,
  size: number,
): Promise<ImageDimensions> {
  if (!mimetype.startsWith("image/")) return {};
  if (size > MAX_PROBE_SIZE_BYTES) return {};
  try {
    const readUrl = await CreateReadUrl(storageKey, undefined, storage);
    const response = await fetch(readUrl.url);
    if (!response.ok) return {};
    const buffer = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(buffer).metadata();
    return { width: metadata.width, height: metadata.height };
  } catch {
    return {};
  }
}

export class MediaUploadController extends Controller("/api/media") {
  @Context()
  declare ctx: RequestContext;

  @TenantScopedModel(MediaFolderModel)
  declare folderModel: MediaFolderModel;

  @TenantScopedModel(MediaAssetModel)
  declare assetModel: MediaAssetModel;

  @TenantScopedModel(RoleModel)
  declare roleModel: RoleModel;

  @TenantScopedModel(TenantMemberModel)
  declare memberModel: TenantMemberModel;

  @AuthTenantMember()
  declare user: User;

  private resolveContext(): Promise<MediaRequestContext> {
    return resolveMediaContext(this);
  }

  @Post("/upload/presign")
  async presign(@JSONBody() body: unknown) {
    const { folderId, filename, size, mimetype } = assertValidation(body, (v) =>
      presignSchema.parse(v),
    );
    const context = await this.resolveContext();
    requireFolderRight(context, folderId, "write");
    const storage = getMediaConfig().storage;
    return await CreateUploadUrl(
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
  }

  @Post("/upload/confirm")
  async confirm(@JSONBody() body: unknown) {
    const { folderId, resourceKey, filename } = assertValidation(body, (v) =>
      confirmUploadSchema.parse(v),
    );
    const context = await this.resolveContext();
    requireFolderRight(context, folderId, "write");
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
    const storage = getMediaConfig().storage;
    const metadata = await GetFileMetadata(resourceKey, storage);
    const promoted = await PromoteFile(resourceKey, storage);
    const dimensions = await probeImageDimensions(
      promoted.resourceKey,
      storage,
      metadata.mimetype,
      metadata.size,
    );
    const [assetId] = await context.assetModel.insert({
      folderId,
      mediaRevision: randomUUID(),
      json_retiredFiles: "[]",
      name: filename,
      mimetype: metadata.mimetype,
      size: metadata.size,
      storageKey: promoted.resourceKey,
      storage,
      width: dimensions.width,
      height: dimensions.height,
      visibility: "inherit",
      createdBy: context.user._id,
    });
    const asset = await context.assetModel.get(assetId);
    assert(asset, HTTP_BAD_REQUEST, "Asset creation failed");
    return { asset: buildAssetDto(context, asset) };
  }
}
