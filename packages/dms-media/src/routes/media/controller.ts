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
import { type MediaRequestContext, resolveMediaContext } from "./context";

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
}
