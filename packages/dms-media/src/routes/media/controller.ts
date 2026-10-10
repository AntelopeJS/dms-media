import {
  Context,
  Controller,
  type RequestContext,
} from "@antelopejs/interface-api";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { AuthTenantMember } from "@antelopejs/interface-dms/guards";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { MediaAssetModel, MediaFolderModel } from "../../db";
import { type MediaEventInput, recordMediaEvent } from "../../library/events";
import { type MediaRequestContext, resolveMediaContext } from "./context";

const DEFAULT_PROTOCOL = "http";
const HEADER_LIST_SEPARATOR = ",";

function firstHeader(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(HEADER_LIST_SEPARATOR)[0]?.trim() || undefined;
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

  /** The origin the caller reached the API on, behind a proxy included. */
  protected requestOrigin(): string {
    const headers = this.ctx.rawRequest.headers;
    const forwardedProto = firstHeader(headers["x-forwarded-proto"]);
    const host = firstHeader(headers["x-forwarded-host"]) ?? headers.host;
    if (!host) return "";
    return `${forwardedProto ?? DEFAULT_PROTOCOL}://${host}`;
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
