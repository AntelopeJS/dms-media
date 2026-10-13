import {
  Context,
  Controller,
  Get,
  HTTPResult,
  Parameter,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { IfAuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { GetClientBaseUrl } from "@antelopejs/interface-dms/client-base-url";
import { getMediaConfig } from "../../config";
import { type MediaAsset, MediaAssetModel, MediaFolderModel } from "../../db";
import { ensureDerivative, UnreadableImageError } from "../../derivatives";
import { fileLink } from "../../library/links";
import type { MediaPresetConfig } from "../../presets";
import { signedReadUrl } from "../../read-urls";
import {
  PRIVATE_READ_URL_TTL_SECONDS,
  PRIVATE_REDIRECT_CACHE_CONTROL,
  PUBLIC_READ_URL_TTL_SECONDS,
  PUBLIC_REDIRECT_CACHE_CONTROL,
} from "./constants";
import { resolveActorAccess } from "./context";
import { isActiveContent } from "./delivery-headers";
import { openPublicCors, streamStoredFile } from "./delivery-stream";
import { resolveEffectiveVisibility } from "./dto";

const HTTP_FOUND = 302;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const HTTP_SERVICE_UNAVAILABLE = 503;
const PATH_SEPARATOR = "/";
const TRAILING_SLASHES = /\/+$/;
const HTML_MIMETYPE = "text/html";
/** Language-neutral: the dashboard URL is unknown, so nothing can be localized or linked. */
const SIGN_IN_PAGE =
  '<!doctype html><html><head><meta charset="utf-8"><title>401</title></head><body><p>401</p></body></html>';

/**
 * Formats accepted by the transform pipeline. Sharp would silently
 * rasterize or flatten anything else (SVG, animated sources).
 *
 * Mirrored in `frontend-vue/app/utils/mediaFiles.ts` for the UI
 * affordances: the frontend module is copied by ajs dms at prepare time and
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

function isPageNavigation(ctx: RequestContext): boolean {
  return (ctx.rawRequest.headers.accept ?? "").includes(HTML_MIMETYPE);
}

/**
 * A browser opening a private link without a token goes to the file's page
 * in the dashboard: an open session shows it at once, otherwise the
 * dashboard sends to its sign-in and back.
 */
async function signInResponse(
  ctx: RequestContext,
  asset: MediaAsset,
): Promise<HTTPResult> {
  const base = await GetClientBaseUrl().catch(() => undefined);
  const response = ctx.response;
  response.addHeader("Cache-Control", PRIVATE_REDIRECT_CACHE_CONTROL);
  if (!base) {
    response.setStatus(HTTP_UNAUTHORIZED);
    response.setBody(SIGN_IN_PAGE, HTML_MIMETYPE);
    return response;
  }
  response.setStatus(HTTP_FOUND);
  response.addHeader(
    "Location",
    `${base.replace(TRAILING_SLASHES, "")}${fileLink(asset._id)}`,
  );
  response.setBody("");
  return response;
}

/** A private file reached by a browser without a session. */
class SignInRequired extends Error {
  constructor(readonly asset: MediaAsset) {
    super("Authentication required");
  }
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
  if (!user && isPageNavigation(ctx)) throw new SignInRequired(asset);
  assert(user, HTTP_UNAUTHORIZED, "Authentication required");
  await assertUserReadsFolder(tenantId, user, asset.folderId, folderModel);
  return { asset, assetModel, isPublic: false };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function redirectTo(
  ctx: RequestContext,
  location: string,
  cacheControl: string,
): HTTPResult {
  ctx.response.setStatus(HTTP_FOUND);
  ctx.response.addHeader("Location", location);
  ctx.response.addHeader("Cache-Control", cacheControl);
  ctx.response.setBody("");
  return ctx.response;
}

/** Sends a link with a stale file name to the asset's canonical URL. */
function canonicalRedirect(
  ctx: RequestContext,
  canonicalPath: string,
): HTTPResult | undefined {
  if (safeDecode(ctx.url.pathname) === safeDecode(canonicalPath)) {
    return undefined;
  }
  return redirectTo(ctx, canonicalPath, PUBLIC_REDIRECT_CACHE_CONTROL);
}

/**
 * Redirects to the storage's signed URL. The redirect itself is never cached
 * (an edit shows at once); its target is reused for half its lifetime, so
 * the bytes stay cacheable under one address and no token is written per read.
 */
async function redirectToStorage(
  ctx: RequestContext,
  storageKey: string,
  storage: string | undefined,
  isPublic: boolean,
): Promise<HTTPResult> {
  const ttl = isPublic
    ? PUBLIC_READ_URL_TTL_SECONDS
    : PRIVATE_READ_URL_TTL_SECONDS;
  const location = await signedReadUrl(storageKey, storage, ttl);
  if (isPublic) openPublicCors(ctx.response);
  return redirectTo(
    ctx,
    location,
    isPublic ? PUBLIC_REDIRECT_CACHE_CONTROL : PRIVATE_REDIRECT_CACHE_CONTROL,
  );
}

function assertNamedSegment(ctx: RequestContext): void {
  assert(
    !ctx.url.pathname.endsWith(PATH_SEPARATOR),
    HTTP_NOT_FOUND,
    "File name required",
  );
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

async function requireDerivative(
  assetModel: MediaAssetModel,
  asset: MediaAsset,
  preset: MediaPresetConfig,
): Promise<string> {
  return ensureDerivative(assetModel, asset, preset).catch((error: unknown) => {
    assert(
      !(error instanceof UnreadableImageError),
      HTTP_UNPROCESSABLE_ENTITY,
      "This file is not a readable image",
    );
    Logging.Error(`Media size '${preset.id}' of ${asset._id} failed:`, error);
    throw new HTTPResult(
      HTTP_SERVICE_UNAVAILABLE,
      "This image size is temporarily unavailable",
    );
  });
}

function assetPath(asset: MediaAsset, presetId?: string): string {
  const segments = [asset._id, presetId, encodeURIComponent(asset.name)];
  return `/media/${segments.filter(Boolean).join(PATH_SEPARATOR)}`;
}

/** Answers the sign-in page or redirect instead of a bare 401 to a browser. */
function guardSignIn<T>(
  ctx: RequestContext,
  resolution: Promise<T>,
): Promise<T | HTTPResult> {
  return resolution.catch((error: unknown) => {
    if (error instanceof SignInRequired) {
      return signInResponse(ctx, error.asset);
    }
    throw error;
  });
}

async function deliverAsset(
  ctx: RequestContext,
  { asset, isPublic }: DeliverableAsset,
): Promise<HTTPResult | undefined> {
  const redirect = canonicalRedirect(ctx, assetPath(asset));
  if (redirect) return redirect;
  if (!isActiveContent(asset.mimetype)) {
    return redirectToStorage(ctx, asset.storageKey, asset.storage, isPublic);
  }
  return streamStoredFile(ctx, {
    storageKey: asset.storageKey,
    storage: asset.storage,
    mimetype: asset.mimetype,
    filename: asset.name,
    isPublic,
  });
}

async function deliverDerivativeOf(
  ctx: RequestContext,
  { asset, assetModel, isPublic }: DeliverableAsset,
  presetId: string,
): Promise<HTTPResult> {
  const preset = requirePreset(presetId);
  assertDerivableAsset(asset);
  const redirect = canonicalRedirect(ctx, assetPath(asset, preset.id));
  if (redirect) return redirect;
  const derivativeKey = await requireDerivative(assetModel, asset, preset);
  return redirectToStorage(ctx, derivativeKey, asset.storage, isPublic);
}

export class MediaDeliveryController extends Controller("/media") {
  @Get("/:assetId/:filename")
  async deliverOriginal(
    @Context() ctx: RequestContext,
    @Parameter("assetId", "param") assetId: string,
    @IfAuthUser() user?: User,
  ) {
    assertNamedSegment(ctx);
    const resolved = await guardSignIn(
      ctx,
      resolveDeliverableAsset(ctx, assetId, user),
    );
    if (!("asset" in resolved)) return resolved;
    return deliverAsset(ctx, resolved);
  }

  @Get("/:assetId/:presetId/:filename")
  async deliverDerivative(
    @Context() ctx: RequestContext,
    @Parameter("assetId", "param") assetId: string,
    @Parameter("presetId", "param") presetId: string,
    @IfAuthUser() user?: User,
  ) {
    assertNamedSegment(ctx);
    // Resolve (and authorize) the asset before touching the preset so an
    // unauthenticated caller cannot probe which preset IDs are configured.
    const resolved = await guardSignIn(
      ctx,
      resolveDeliverableAsset(ctx, assetId, user),
    );
    if (!("asset" in resolved)) return resolved;
    return deliverDerivativeOf(ctx, resolved, presetId);
  }
}
