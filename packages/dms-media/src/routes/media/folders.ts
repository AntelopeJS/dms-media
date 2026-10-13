import { MediaApiController } from "./controller";
import {
  Delete,
  Get,
  JSONBody,
  Parameter,
  Post,
  Put,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { serializeAcl } from "../../acl";
import { deleteMediaAsset } from "../../asset-lifecycle";
import { forgetFavorites } from "../../library/favorites";
import { type MediaFolder } from "../../db";
import {
  comparableName,
  createFolderSchema,
  folderAclSchema,
  folderVisibilitySchema,
  MEDIA_ERRORS,
  moveFolderSchema,
  parseBody,
  renameFolderSchema,
} from "../../validation/media.schema";
import {
  assertNotBound,
  assertMediaOwner,
  getDescendantFolders,
  type MediaRequestContext,
  requireFolderRight,
} from "./context";
import { readFolderAclEntries } from "./dto";

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_CONFLICT = 409;

function assertUniqueSiblingName(
  context: MediaRequestContext,
  name: string,
  parentId: string | undefined,
  ignoredId?: string,
): void {
  const wanted = comparableName(name);
  const clash = context.folders.some(
    (folder) =>
      folder._id !== ignoredId &&
      (folder.parentId ?? undefined) === parentId &&
      comparableName(folder.name) === wanted,
  );
  assert(!clash, HTTP_CONFLICT, MEDIA_ERRORS.folderNameTaken);
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
  const parent = requireFolderRight(context, parentId, "manage");
  assert(!parent.binding, HTTP_FORBIDDEN, MEDIA_ERRORS.boundParent);
  return parent;
}

function buildChildPath(parent: MediaFolder | undefined): string[] {
  return parent ? [...parent.path, parent._id] : [];
}

type FolderTreeModels = Pick<MediaRequestContext, "folderModel" | "assetModel">;

async function deleteFolderAssets(
  context: FolderTreeModels,
  folderIds: string[],
): Promise<void> {
  const assets = await context.assetModel.getBy("folderId", ...folderIds);
  await Promise.all(
    assets.map((asset) => deleteMediaAsset(context.assetModel, asset._id)),
  );
}

/**
 * Deletes folder rows first, then cascades from the database rather than the
 * request snapshot, so children and assets written concurrently under a
 * deleted folder are removed instead of left orphaned.
 */
export async function deleteFolderTree(
  context: FolderTreeModels,
  folderIds: string[],
): Promise<void> {
  let pending = folderIds;
  while (pending.length > 0) {
    await Promise.all(pending.map((id) => context.folderModel.delete(id)));
    const [lateChildren] = await Promise.all([
      context.folderModel.getBy("parentId", ...pending),
      deleteFolderAssets(context, pending),
    ]);
    pending = lateChildren.map((child) => child._id);
  }
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

export class MediaFoldersController extends MediaApiController {
  @Get("/folders/:folderId/acl")
  async getAcl(@Parameter("folderId", "param") folderId: string) {
    const context = await this.resolveContext();
    const folder = requireFolderRight(context, folderId, "manage");
    assertMediaOwner(context);
    return { entries: readFolderAclEntries(folder) };
  }

  @Post("/folders")
  async createFolder(@JSONBody() body: unknown) {
    const { name, parentId } = parseBody(body, createFolderSchema);
    const context = await this.resolveContext();
    const parent = assertCanPlaceUnder(context, parentId);
    assertUniqueSiblingName(context, name, parentId);
    const [folderId] = await context.folderModel.insert({
      name,
      parentId,
      path: buildChildPath(parent),
      visibility: "private",
    });
    await this.record(context, {
      kind: "folder.create",
      targetName: name,
      folderId: parentId,
      details: { targetId: folderId },
    });
    return { id: folderId };
  }

  @Post("/folders/:folderId/rename")
  async renameFolder(
    @Parameter("folderId", "param") folderId: string,
    @JSONBody() body: unknown,
  ) {
    const { name } = parseBody(body, renameFolderSchema);
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
    await this.record(context, {
      kind: "folder.rename",
      targetName: name,
      folderId,
      details: { previous: folder.name },
    });
    return { ok: true };
  }

  @Post("/folders/:folderId/move")
  async moveFolder(
    @Parameter("folderId", "param") folderId: string,
    @JSONBody() body: unknown,
  ) {
    const { parentId } = parseBody(body, moveFolderSchema);
    const context = await this.resolveContext();
    const folder = requireFolderRight(context, folderId, "manage");
    assertNotBound(folder);
    const targetParentId = parentId ?? undefined;
    const newParent = assertCanPlaceUnder(context, targetParentId);
    assertMoveTargetOutsideSubtree(folder, targetParentId, newParent);
    assertUniqueSiblingName(context, folder.name, targetParentId, folderId);
    await applyFolderMove(context, folder, newParent);
    await this.record(context, {
      kind: "folder.move",
      targetName: folder.name,
      folderId,
      details: { destination: newParent?.name ?? "" },
    });
    return { ok: true };
  }

  @Post("/folders/:folderId/visibility")
  async setVisibility(
    @Parameter("folderId", "param") folderId: string,
    @JSONBody() body: unknown,
  ) {
    const { visibility } = parseBody(body, folderVisibilitySchema);
    const context = await this.resolveContext();
    const folder = requireFolderRight(context, folderId, "manage");
    assertMediaOwner(context);
    await context.folderModel.update(folderId, { visibility });
    await this.record(context, {
      kind: "folder.visibility",
      targetName: folder.name,
      folderId,
      details: { visibility: `$dms_media.visibility.${visibility}` },
    });
    return { ok: true };
  }

  @Put("/folders/:folderId/acl")
  async setAcl(
    @Parameter("folderId", "param") folderId: string,
    @JSONBody() body: unknown,
  ) {
    const { entries } = parseBody(body, folderAclSchema);
    const context = await this.resolveContext();
    const folder = requireFolderRight(context, folderId, "manage");
    assertNotBound(folder);
    assertMediaOwner(context);
    await context.folderModel.update(folderId, {
      json_acl: serializeAcl(entries ?? undefined) ?? "",
    });
    await this.record(context, {
      kind: "folder.acl",
      targetName: folder.name,
      folderId,
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
    const assets = await context.assetModel.getBy("folderId", ...folderIds);
    await deleteFolderTree(context, folderIds);
    await forgetFavorites(context.tenantId, [
      ...folderIds,
      ...assets.map((asset) => asset._id),
    ]);
    await this.record(context, {
      kind: "folder.delete",
      targetName: folder.name,
      folderId: folder.parentId,
      count: assets.length,
      size: assets.reduce((total, asset) => total + asset.size, 0),
      details: {
        files: assets.length,
        folders: folderIds.length,
      },
    });
    return { ok: true };
  }
}
