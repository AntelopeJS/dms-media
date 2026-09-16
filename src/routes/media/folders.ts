import {
  Context,
  Controller,
  Delete,
  Get,
  JSONBody,
  Parameter,
  Post,
  Put,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { AuthTenantMember } from "@antelopejs/interface-dms/guards";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { serializeAcl } from "../../acl";
import { deleteMediaAsset } from "../../asset-lifecycle";
import { MediaAssetModel, type MediaFolder, MediaFolderModel } from "../../db";
import {
  createFolderSchema,
  folderAclSchema,
  folderVisibilitySchema,
  moveFolderSchema,
  renameFolderSchema,
} from "../../validation/media.schema";
import {
  assertNotBound,
  assertPermissionsManager,
  getDescendantFolders,
  type MediaRequestContext,
  requireFolderRight,
  resolveMediaContext,
} from "./context";
import { buildAssetDto, listVisibleFolders, readFolderAclEntries } from "./dto";

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_CONFLICT = 409;

function assertUniqueSiblingName(
  context: MediaRequestContext,
  name: string,
  parentId: string | undefined,
  ignoredId?: string,
): void {
  const clash = context.folders.some(
    (folder) =>
      folder._id !== ignoredId &&
      (folder.parentId ?? undefined) === parentId &&
      folder.name === name,
  );
  assert(!clash, HTTP_CONFLICT, "A sibling folder already has this name");
}

function assertCanPlaceUnder(
  context: MediaRequestContext,
  parentId: string | undefined,
): MediaFolder | undefined {
  if (!parentId) {
    assert(
      context.rootRights.has("manage"),
      HTTP_FORBIDDEN,
      "Missing 'manage' right at the media root",
    );
    return undefined;
  }
  return requireFolderRight(context, parentId, "manage");
}

function buildChildPath(parent: MediaFolder | undefined): string[] {
  return parent ? [...parent.path, parent._id] : [];
}

async function deleteFolderAssets(
  context: MediaRequestContext,
  folderIds: string[],
): Promise<void> {
  if (folderIds.length === 0) return;
  const assets = await context.assetModel.getBy("folderId", ...folderIds);
  await Promise.all(
    assets.map((asset) => deleteMediaAsset(context.assetModel, asset._id)),
  );
}

async function applyFolderMove(
  context: MediaRequestContext,
  folder: MediaFolder,
  newParent: MediaFolder | undefined,
): Promise<void> {
  const newPaths = new Map<string, string[]>();
  newPaths.set(folder._id, buildChildPath(newParent));
  const descendants = getDescendantFolders(context, folder._id);
  for (const descendant of descendants) {
    const parentPath = newPaths.get(descendant.parentId ?? "") ?? [];
    newPaths.set(descendant._id, [...parentPath, descendant.parentId ?? ""]);
  }
  await context.folderModel.update(folder._id, {
    parentId: newParent?._id,
    path: newPaths.get(folder._id),
  });
  await Promise.all(
    descendants.map((descendant) =>
      context.folderModel.update(descendant._id, {
        path: newPaths.get(descendant._id),
      }),
    ),
  );
}

function assertMoveTargetOutsideSubtree(
  folder: MediaFolder,
  targetParentId: string | undefined,
  newParent: MediaFolder | undefined,
): void {
  const insideItself =
    targetParentId === folder._id ||
    (newParent?.path ?? []).includes(folder._id) ||
    newParent?.parentId === folder._id;
  assert(!insideItself, HTTP_BAD_REQUEST, "Cannot move a folder inside itself");
}

export class MediaFoldersController extends Controller("/api/media") {
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

  @Get("/tree")
  async tree() {
    const context = await this.resolveContext();
    return {
      folders: listVisibleFolders(context),
      root: {
        write: context.rootRights.has("write"),
        manage: context.rootRights.has("manage"),
      },
    };
  }

  @Get("/folders/:folderId/assets")
  async listAssets(@Parameter("folderId", "param") folderId: string) {
    const context = await this.resolveContext();
    requireFolderRight(context, folderId, "read");
    const assets = await context.assetModel.getByFolder(folderId);
    return { assets: assets.map((asset) => buildAssetDto(context, asset)) };
  }

  @Get("/folders/:folderId/acl")
  async getAcl(@Parameter("folderId", "param") folderId: string) {
    const context = await this.resolveContext();
    const folder = requireFolderRight(context, folderId, "manage");
    await assertPermissionsManager(context);
    return { entries: readFolderAclEntries(folder) };
  }

  @Post("/folders")
  async createFolder(@JSONBody() body: unknown) {
    const { name, parentId } = assertValidation(body, (v) =>
      createFolderSchema.parse(v),
    );
    const context = await this.resolveContext();
    const parent = assertCanPlaceUnder(context, parentId);
    assertUniqueSiblingName(context, name, parentId);
    const [folderId] = await context.folderModel.insert({
      name,
      parentId,
      path: buildChildPath(parent),
      visibility: "private",
    });
    return { id: folderId };
  }

  @Post("/folders/:folderId/rename")
  async renameFolder(
    @Parameter("folderId", "param") folderId: string,
    @JSONBody() body: unknown,
  ) {
    const { name } = assertValidation(body, (v) => renameFolderSchema.parse(v));
    const context = await this.resolveContext();
    const folder = requireFolderRight(context, folderId, "manage");
    assertNotBound(folder);
    assertUniqueSiblingName(
      context,
      name,
      folder.parentId ?? undefined,
      folderId,
    );
    await context.folderModel.update(folderId, { name });
    return { ok: true };
  }

  @Post("/folders/:folderId/move")
  async moveFolder(
    @Parameter("folderId", "param") folderId: string,
    @JSONBody() body: unknown,
  ) {
    const { parentId } = assertValidation(body, (v) =>
      moveFolderSchema.parse(v),
    );
    const context = await this.resolveContext();
    const folder = requireFolderRight(context, folderId, "manage");
    assertNotBound(folder);
    const targetParentId = parentId ?? undefined;
    const newParent = assertCanPlaceUnder(context, targetParentId);
    assertMoveTargetOutsideSubtree(folder, targetParentId, newParent);
    assertUniqueSiblingName(context, folder.name, targetParentId, folderId);
    await applyFolderMove(context, folder, newParent);
    return { ok: true };
  }

  @Post("/folders/:folderId/visibility")
  async setVisibility(
    @Parameter("folderId", "param") folderId: string,
    @JSONBody() body: unknown,
  ) {
    const { visibility } = assertValidation(body, (v) =>
      folderVisibilitySchema.parse(v),
    );
    const context = await this.resolveContext();
    requireFolderRight(context, folderId, "manage");
    await assertPermissionsManager(context);
    await context.folderModel.update(folderId, { visibility });
    return { ok: true };
  }

  @Put("/folders/:folderId/acl")
  async setAcl(
    @Parameter("folderId", "param") folderId: string,
    @JSONBody() body: unknown,
  ) {
    const { entries } = assertValidation(body, (v) => folderAclSchema.parse(v));
    const context = await this.resolveContext();
    const folder = requireFolderRight(context, folderId, "manage");
    assertNotBound(folder);
    await assertPermissionsManager(context);
    await context.folderModel.update(folderId, {
      json_acl: serializeAcl(entries ?? undefined) ?? "",
    });
    return { ok: true };
  }

  @Delete("/folders/:folderId")
  async deleteFolder(@Parameter("folderId", "param") folderId: string) {
    const context = await this.resolveContext();
    const folder = requireFolderRight(context, folderId, "manage");
    assertNotBound(folder);
    const descendants = getDescendantFolders(context, folderId);
    for (const descendant of descendants) {
      assertNotBound(descendant);
      assert(
        context.access.manageable.has(descendant._id),
        HTTP_FORBIDDEN,
        "Missing 'manage' right on a subfolder",
      );
    }
    const folderIds = [folderId, ...descendants.map((child) => child._id)];
    await deleteFolderAssets(context, folderIds);
    await Promise.all(folderIds.map((id) => context.folderModel.delete(id)));
    return { ok: true };
  }
}
