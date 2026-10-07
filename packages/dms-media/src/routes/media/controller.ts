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

const CONTENT_LANGUAGE_HEADER = "x-content-language";

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

  /** The interface language of the dashboard that sent the request. */
  protected requestLanguage(): string | undefined {
    const header = this.ctx.rawRequest.headers[CONTENT_LANGUAGE_HEADER];
    const language = Array.isArray(header) ? header[0] : header;
    return language || this.user.language;
  }

  /** The query string as plain values, for schema parsing. */
  protected readQuery(): Record<string, string> {
    return Object.fromEntries(this.ctx.url.searchParams);
  }
}
