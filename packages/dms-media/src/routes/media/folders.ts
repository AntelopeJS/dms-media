import { MediaApiController } from "./controller";
import { Delete, JSONBody, Parameter, Post } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { type MediaFolder } from "../../db";
import {
  applyFolderDeletion,
  applyFolderVisibility,
  assertCanPlaceUnder,
  assertUniqueSiblingName,
  buildChildPath,
  planFolderDeletion,
  planFolderVisibility,
} from "../../services/folders";
import {
  createFolderSchema,
  folderVisibilitySchema,
  moveFolderSchema,
  rejectInvalid,
  renameFolderSchema,
} from "../../validation/media.schema";
import {
  assertNotBound,
  getDescendantFolders,
  type MediaRequestContext,
  requireFolderRight,
} from "./context";

const HTTP_BAD_REQUEST = 400;

export {
  buildChildPath,
  deleteFolderTree,
  hasSiblingNamed,
} from "../../services/folders";

/** Moves a folder and rewrites the materialized path of everything under it. */
export async function applyFolderMove(
  context: Pick<MediaRequestContext, "folderModel" | "folders">,
  folder: MediaFolder,
  newParent: MediaFolder | undefined,
): Promise<void> {
  const path = buildChildPath(newParent);
  await context.folderModel.update(folder._id, {
    parentId: newParent?._id,
    path,
  });
  await rewriteDescendantPaths(context, folder, path);
}

/** Rewrites descendant paths after the root move has been accepted. */
export async function rewriteDescendantPaths(
  context: Pick<MediaRequestContext, "folderModel" | "folders">,
  folder: MediaFolder,
  path: string[],
): Promise<void> {
  const newPaths = new Map<string, string[]>();
  newPaths.set(folder._id, path);
  const descendants = getDescendantFolders(context, folder._id);
  for (const descendant of descendants) {
    const parentPath = newPaths.get(descendant.parentId ?? "") ?? [];
    newPaths.set(descendant._id, [...parentPath, descendant.parentId ?? ""]);
  }
  await Promise.all(
    descendants.map((descendant) =>
      context.folderModel.update(descendant._id, {
        path: newPaths.get(descendant._id),
      }),
    ),
  );
}

/** Whether a proposed parent would put a folder inside its own subtree. */
export function isMoveInsideSubtree(
  folder: MediaFolder,
  newParent: MediaFolder | undefined,
): boolean {
  return (
    newParent?._id === folder._id ||
    (newParent?.path ?? []).includes(folder._id) ||
    newParent?.parentId === folder._id
  );
}

export class MediaFoldersController extends MediaApiController {
  @Post("/folders")
  async createFolder(@JSONBody() body: unknown) {
    const { name, parentId } = rejectInvalid(() =>
      createFolderSchema.parse(body),
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
    const { name } = rejectInvalid(() => renameFolderSchema.parse(body));
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
    const { parentId } = rejectInvalid(() => moveFolderSchema.parse(body));
    const context = await this.resolveContext();
    const folder = requireFolderRight(context, folderId, "manage");
    assertNotBound(folder);
    const targetParentId = parentId ?? undefined;
    const newParent = assertCanPlaceUnder(context, targetParentId);
    assert(
      !isMoveInsideSubtree(folder, newParent),
      HTTP_BAD_REQUEST,
      "Cannot move a folder inside itself",
    );
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
    const { visibility } = rejectInvalid(() =>
      folderVisibilitySchema.parse(body),
    );
    const context = await this.resolveContext();
    await applyFolderVisibility(
      context,
      planFolderVisibility(context, folderId, visibility),
    );
    return { ok: true };
  }

  @Delete("/folders/:folderId")
  async deleteFolder(@Parameter("folderId", "param") folderId: string) {
    const context = await this.resolveContext();
    await applyFolderDeletion(
      context,
      await planFolderDeletion(context, folderId),
    );
    return { ok: true };
  }
}
