import {
  Context,
  Controller,
  type RequestContext,
} from "@antelopejs/interface-api";
import { GetApiBaseUrl } from "@antelopejs/interface-dms/api-base-url";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { AuthTenantMember } from "@antelopejs/interface-dms/guards";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { getMediaConfig } from "../../config";
import { MediaAssetModel, MediaFolderModel } from "../../db";
import { type MediaEventInput, recordMediaEvent } from "../../library/events";
import { type MediaRequestContext, resolveMediaContext } from "./context";

const TRAILING_SLASHES = /\/+$/;

/**
 * The module's `publicBaseUrl`, else the DMS `apiBaseUrl`; empty when neither
 * is configured, so links stay relative to the API.
 */
export function resolvePublicOrigin(
  configured: string | undefined,
  apiBaseUrl: string | undefined,
): string {
  return (configured || apiBaseUrl || "").replace(TRAILING_SLASHES, "");
}

/**
 * Base of every `/api/media` controller: the tenant-scoped models and the
 * authenticated member a request resolves its folder access from.
 */
export class MediaApiController extends Controller("/api/media") {
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

  /**
   * The origin copied links start with: the API's, which serves `/media`
   * to any browser (the dashboard's origin only relays non-HTML requests
   * there). The module's `publicBaseUrl` wins over the DMS `apiBaseUrl`.
   */
  protected async publicOrigin(): Promise<string> {
    return resolvePublicOrigin(
      getMediaConfig().publicBaseUrl,
      await GetApiBaseUrl(),
    );
  }

  protected resolveContext(): Promise<MediaRequestContext> {
    return resolveMediaContext(this);
  }

  /** Adds an entry to the library activity on behalf of the caller. */
  protected record(
    context: MediaRequestContext,
    input: MediaEventInput,
  ): Promise<void> {
    return recordMediaEvent(context, input);
  }

  /** The query string as plain values, for schema parsing. */
  protected readQuery(): Record<string, string> {
    return Object.fromEntries(this.ctx.url.searchParams);
  }
}
