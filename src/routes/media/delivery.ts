import {
  Context,
  Controller,
  Get,
  HTTPResult,
  Parameter,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { CreateReadUrl } from "@antelopejs/interface-file-storage";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { IfAuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { getMediaConfig } from "../../config";
import { type MediaAsset, MediaAssetModel, MediaFolderModel } from "../../db";
import { ensureDerivative } from "../../derivatives";
import type { MediaPresetConfig } from "../../presets";
import {
  PRIVATE_CACHE_CONTROL,
  PRIVATE_READ_URL_TTL_SECONDS,
  PUBLIC_CACHE_CONTROL,
  PUBLIC_READ_URL_TTL_SECONDS,
} from "./constants";
import { resolveActorAccess } from "./context";
import { resolveEffectiveVisibility } from "./dto";

const HTTP_FOUND = 302;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE_ENTITY = 422;

/**
 * Formats accepted by the transform pipeline. Sharp would silently
 * rasterize or flatten anything else (SVG, animated sources).
 *
 * Mirrored in `frontend-vue/app/utils/finder/mime.ts` for the UI
 * affordances: the frontend module is copied by ajs-dms at prepare time and
 * cannot resolve imports into the backend `src/` tree, so keep both
 * lists in sync when adding a format.
 */
export const EDITABLE_IMAGE_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

interface DeliverableAsset {
  asset: MediaAsset;
  assetModel: MediaAssetModel;
  isPublic: boolean;
}

function redirectTo(url: string, cacheControl: string): HTTPResult {
  return HTTPResult.withHeaders(
    "",
    { Location: url, "Cache-Control": cacheControl },
    HTTP_FOUND,
  );
}

async function assertUserReadsFolder(
  tenantId: string,
  user: User,
  folderId: string,
  folderModel: MediaFolderModel,
): Promise<void> {
  const { access } = await resolveActorAccess({
    tenantId,
    user,
    folderModel,
    roleModel: GetModel(RoleModel, tenantId),
    memberModel: GetModel(TenantMemberModel, tenantId),
  });
  assert(
    access.readable.has(folderId),
    HTTP_FORBIDDEN,
    "Missing read access on this asset",
  );
}

async function resolveDeliverableAsset(
  ctx: RequestContext,
  assetId: string,
  user: User | undefined,
): Promise<DeliverableAsset> {
  const tenantId = getRequestTenantId(ctx);
  const assetModel = GetModel(MediaAssetModel, tenantId);
  const asset = await assetModel.get(assetId);
  assert(asset && !asset.isDeleting, HTTP_NOT_FOUND, "Asset not found");
  const folderModel = GetModel(MediaFolderModel, tenantId);
  const folder = await folderModel.get(asset.folderId);
  const visibility = resolveEffectiveVisibility(asset, folder ?? undefined);
  if (visibility === "public") {
    return { asset, assetModel, isPublic: true };
  }
  assert(user, HTTP_UNAUTHORIZED, "Authentication required");
  await assertUserReadsFolder(tenantId, user, asset.folderId, folderModel);
  return { asset, assetModel, isPublic: false };
}

async function redirectToStorageKey(
  storageKey: string,
  storage: string | undefined,
  isPublic: boolean,
): Promise<HTTPResult> {
  const ttl = isPublic
    ? PUBLIC_READ_URL_TTL_SECONDS
    : PRIVATE_READ_URL_TTL_SECONDS;
  const cacheControl = isPublic ? PUBLIC_CACHE_CONTROL : PRIVATE_CACHE_CONTROL;
  const readUrl = await CreateReadUrl(storageKey, ttl, storage);
  return redirectTo(readUrl.url, cacheControl);
}

export function requirePreset(presetId: string): MediaPresetConfig {
  const preset = getMediaConfig().presets.get(presetId);
  assert(preset, HTTP_NOT_FOUND, "Unknown preset");
  return preset;
}

export function assertDerivableAsset(asset: MediaAsset): void {
  assert(
    asset.mimetype.startsWith("image/"),
    HTTP_NOT_FOUND,
    "Derivatives only exist for images",
  );
}

export function assertEditableAsset(asset: MediaAsset): void {
  assert(
    EDITABLE_IMAGE_MIMETYPES.has(asset.mimetype),
    HTTP_UNPROCESSABLE_ENTITY,
    "This image format cannot be edited",
  );
}

export class MediaDeliveryController extends Controller("/media") {
  @Get("/:assetId/:filename")
  async deliverOriginal(
    @Context() ctx: RequestContext,
    @Parameter("assetId", "param") assetId: string,
    @IfAuthUser() user?: User,
  ) {
    const { asset, isPublic } = await resolveDeliverableAsset(
      ctx,
      assetId,
      user,
    );
    return redirectToStorageKey(asset.storageKey, asset.storage, isPublic);
  }

  @Get("/:assetId/:presetId/:filename")
  async deliverDerivative(
    @Context() ctx: RequestContext,
    @Parameter("assetId", "param") assetId: string,
    @Parameter("presetId", "param") presetId: string,
    @IfAuthUser() user?: User,
  ) {
    // Resolve (and authorize) the asset before touching the preset so an
    // unauthenticated caller cannot probe which preset IDs are configured.
    const { asset, assetModel, isPublic } = await resolveDeliverableAsset(
      ctx,
      assetId,
      user,
    );
    const preset = requirePreset(presetId);
    assertDerivableAsset(asset);
    const derivativeKey = await ensureDerivative(assetModel, asset, preset);
    return redirectToStorageKey(derivativeKey, asset.storage, isPublic);
  }
}
