import {
  Context,
  Controller,
  Delete,
  Get,
  JSONBody,
  Parameter,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { CreateReadUrl } from "@antelopejs/interface-file-storage";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { AuthTenantMember } from "@antelopejs/interface-dms/guards";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { deleteMediaAsset } from "../../asset-lifecycle";
import { getMediaConfig } from "../../config";
import {
  type MediaAsset,
  MediaAssetModel,
  type MediaFolder,
  MediaFolderModel,
} from "../../db";
import { ensureDerivative } from "../../derivatives";
import type { MediaPresetConfig } from "../../presets";
import {
  assetVisibilitySchema,
  moveAssetSchema,
  previewIdsSchema,
  updateAssetSchema,
} from "../../validation/media.schema";
import {
  PREVIEW_URL_TTL_SECONDS,
  PRIVATE_READ_URL_TTL_SECONDS,
} from "./constants";
import {
  assertPermissionsManager,
  type MediaRequestContext,
  requireFolderRight,
  resolveMediaContext,
} from "./context";
import { assertDerivableAsset, requirePreset } from "./delivery";
import { buildAssetDto, resolveEffectiveVisibility } from "./dto";

function changesEffectiveVisibility(
  asset: MediaAsset,
  sourceFolder: MediaFolder,
  targetFolder: MediaFolder,
): boolean {
  return (
    resolveEffectiveVisibility(asset, sourceFolder) !==
    resolveEffectiveVisibility(asset, targetFolder)
  );
}

const HTTP_NOT_FOUND = 404;
const MAX_SEARCH_RESULTS = 100;
const MAX_LISTING_RESULTS = 1000;
const THUMB_PRESET_ID = "thumb";

async function buildPreviewEntry(
  context: MediaRequestContext,
  assetId: string,
  preset: MediaPresetConfig,
): Promise<[string, string] | null> {
  const asset = await context.assetModel.get(assetId);
  if (
    !asset ||
    asset.isDeleting ||
    !context.access.readable.has(asset.folderId)
  )
    return null;
  if (!asset.mimetype.startsWith("image/")) return null;
  try {
    const derivativeKey = await ensureDerivative(
      context.assetModel,
      asset,
      preset,
    );
    const readUrl = await CreateReadUrl(
      derivativeKey,
      PREVIEW_URL_TTL_SECONDS,
      asset.storage,
    );
    return [assetId, readUrl.url];
  } catch {
    return null;
  }
}

export async function requireReadableAsset(
  context: MediaRequestContext,
  assetId: string,
): Promise<MediaAsset> {
  const asset = await context.assetModel.get(assetId);
  assert(
    asset && !asset.isDeleting && context.access.readable.has(asset.folderId),
    HTTP_NOT_FOUND,
    "Asset not found",
  );
  return asset;
}

function matchesSearch(asset: MediaAsset, term: string, mime: string): boolean {
  if (asset.isDeleting) return false;
  const matchesTerm =
    term.length === 0 || asset.name.toLowerCase().includes(term);
  const matchesMime = mime.length === 0 || asset.mimetype.startsWith(mime);
  return matchesTerm && matchesMime;
}

export class MediaAssetsController extends Controller("/api/media") {
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

  @Get("/assets")
  async listAll() {
    const context = await this.resolveContext();
    const readableFolders = [...context.access.readable];
    if (readableFolders.length === 0) return { assets: [], truncated: false };
    const candidates = await context.assetModel.listByFolders(
      readableFolders,
      MAX_LISTING_RESULTS + 1,
    );
    const truncated = candidates.length > MAX_LISTING_RESULTS;
    const assets = candidates
      .slice(0, MAX_LISTING_RESULTS)
      .map((asset) => buildAssetDto(context, asset));
    return { assets, truncated };
  }

  @Post("/previews")
  async previews(@JSONBody() body: unknown) {
    const { ids } = assertValidation(body, (v) => previewIdsSchema.parse(v));
    const context = await this.resolveContext();
    const thumbPreset = getMediaConfig().presets.get(THUMB_PRESET_ID);
    if (!thumbPreset) return { previews: {} };
    const entries = await Promise.all(
      ids.map((id) => buildPreviewEntry(context, id, thumbPreset)),
    );
    const previews = Object.fromEntries(
      entries.filter((entry): entry is [string, string] => entry !== null),
    );
    return { previews };
  }

  @Get("/assets/search")
  async search(
    @Parameter("q", "query") q?: string,
    @Parameter("mime", "query") mime?: string,
    @Parameter("folderId", "query") folderId?: string,
  ) {
    const context = await this.resolveContext();
    const searchedFolders = folderId
      ? [requireFolderRight(context, folderId, "read")._id]
      : [...context.access.readable];
    if (searchedFolders.length === 0) return { assets: [] };
    const candidates = context.assetModel.table.getAll(
      searchedFolders.length === 1 ? searchedFolders[0] : searchedFolders,
      "folderId",
    );
    const term = (q ?? "").trim().toLowerCase();
    const mimePrefix = (mime ?? "").trim().toLowerCase();
    const assets: ReturnType<typeof buildAssetDto>[] = [];
    for await (const row of candidates) {
      const asset = MediaAssetModel.fromDatabase(row);
      if (!asset || !matchesSearch(asset, term, mimePrefix)) continue;
      assets.push(buildAssetDto(context, asset));
      if (assets.length === MAX_SEARCH_RESULTS) break;
    }
    return { assets };
  }

  @Get("/assets/:assetId")
  async getAsset(@Parameter("assetId", "param") assetId: string) {
    const context = await this.resolveContext();
    const asset = await requireReadableAsset(context, assetId);
    return { asset: buildAssetDto(context, asset) };
  }

  @Get("/assets/:assetId/read-url")
  async readUrl(
    @Parameter("assetId", "param") assetId: string,
    @Parameter("preset", "query") presetId?: string,
  ) {
    const context = await this.resolveContext();
    const asset = await requireReadableAsset(context, assetId);
    let storageKey = asset.storageKey;
    if (presetId) {
      const preset = requirePreset(presetId);
      assertDerivableAsset(asset);
      storageKey = await ensureDerivative(context.assetModel, asset, preset);
    }
    const readUrl = await CreateReadUrl(
      storageKey,
      PRIVATE_READ_URL_TTL_SECONDS,
      asset.storage,
    );
    return { url: readUrl.url, expiresAt: readUrl.expiresAt };
  }

  @Post("/assets/:assetId/update")
  async updateAsset(
    @Parameter("assetId", "param") assetId: string,
    @JSONBody() body: unknown,
  ) {
    const changes = assertValidation(body, (v) => updateAssetSchema.parse(v));
    const context = await this.resolveContext();
    const asset = await requireReadableAsset(context, assetId);
    requireFolderRight(context, asset.folderId, "write");
    await context.assetModel.update(assetId, changes);
    return { ok: true };
  }

  @Post("/assets/:assetId/move")
  async moveAsset(
    @Parameter("assetId", "param") assetId: string,
    @JSONBody() body: unknown,
  ) {
    const { folderId } = assertValidation(body, (v) =>
      moveAssetSchema.parse(v),
    );
    const context = await this.resolveContext();
    const asset = await requireReadableAsset(context, assetId);
    const sourceFolder = requireFolderRight(context, asset.folderId, "write");
    const targetFolder = requireFolderRight(context, folderId, "write");
    if (changesEffectiveVisibility(asset, sourceFolder, targetFolder)) {
      await assertPermissionsManager(context);
    }
    await context.assetModel.update(assetId, { folderId });
    return { ok: true };
  }

  @Post("/assets/:assetId/visibility")
  async setVisibility(
    @Parameter("assetId", "param") assetId: string,
    @JSONBody() body: unknown,
  ) {
    const { visibility } = assertValidation(body, (v) =>
      assetVisibilitySchema.parse(v),
    );
    const context = await this.resolveContext();
    const asset = await requireReadableAsset(context, assetId);
    requireFolderRight(context, asset.folderId, "manage");
    await assertPermissionsManager(context);
    await context.assetModel.update(assetId, { visibility });
    return { ok: true };
  }

  @Delete("/assets/:assetId")
  async deleteAsset(@Parameter("assetId", "param") assetId: string) {
    const context = await this.resolveContext();
    const asset = await requireReadableAsset(context, assetId);
    requireFolderRight(context, asset.folderId, "write");
    await deleteMediaAsset(context.assetModel, assetId);
    return { ok: true };
  }
}
