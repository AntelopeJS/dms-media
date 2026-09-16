import type { RequestContext } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import type {
  RoleModel,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import {
  GetEffectiveUserPermissions,
  HasPermission,
} from "@antelopejs/interface-dms/permissions";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  type AclActor,
  type FolderAccess,
  filterGrantablePermissions,
  resolveFolderAccess,
  resolveRootRights,
} from "../../acl";
import { ensureTenantBindings } from "../../asset-type/bindings";
import { getMediaConfig } from "../../config";
import { MEDIA_PERMISSIONS_MANAGE_PERMISSION } from "../../constants";
import type { MediaAssetModel, MediaFolder, MediaFolderModel } from "../../db";
import type { AclRight } from "../../types";

export interface ActorAccessDeps {
  tenantId: string;
  user: User;
  folderModel: MediaFolderModel;
  roleModel: RoleModel;
  memberModel: TenantMemberModel;
}

export interface ActorAccess {
  tenantId: string;
  permissions: Set<string>;
  actor: AclActor;
  folders: MediaFolder[];
  foldersById: Map<string, MediaFolder>;
  access: FolderAccess;
  rootRights: Set<AclRight>;
}

export interface MediaContextDeps {
  ctx: RequestContext;
  user: User;
  folderModel: MediaFolderModel;
  assetModel: MediaAssetModel;
  roleModel: RoleModel;
  memberModel: TenantMemberModel;
}

export interface MediaRequestContext {
  user: User;
  tenantId: string;
  permissions: Set<string>;
  actor: AclActor;
  folderModel: MediaFolderModel;
  assetModel: MediaAssetModel;
  folders: MediaFolder[];
  foldersById: Map<string, MediaFolder>;
  access: FolderAccess;
  rootRights: Set<AclRight>;
}

const HTTP_NOT_FOUND = 404;
const HTTP_FORBIDDEN = 403;

export async function resolveActorAccess(
  deps: ActorAccessDeps,
): Promise<ActorAccess> {
  const member = await deps.memberModel.getByUser(deps.user._id);
  const roleIds = member?.roleIds ?? [];
  const rawPermissions = await GetEffectiveUserPermissions(
    deps.user,
    deps.tenantId,
    roleIds,
    deps.roleModel,
  );
  const permissions = filterGrantablePermissions(rawPermissions);
  const actor: AclActor = { permissions, roleIds };
  const rootAcl = getMediaConfig().rootAcl;
  await ensureTenantBindings(deps.tenantId, deps.folderModel);
  const folders = await deps.folderModel.getAll();
  return {
    tenantId: deps.tenantId,
    permissions,
    actor,
    folders,
    foldersById: new Map(folders.map((folder) => [folder._id, folder])),
    access: resolveFolderAccess(folders, actor, rootAcl),
    rootRights: resolveRootRights(actor, rootAcl),
  };
}

export async function resolveMediaContext(
  deps: MediaContextDeps,
): Promise<MediaRequestContext> {
  const tenantId = getRequestTenantId(deps.ctx);
  const actorAccess = await resolveActorAccess({
    tenantId,
    user: deps.user,
    folderModel: deps.folderModel,
    roleModel: deps.roleModel,
    memberModel: deps.memberModel,
  });
  return {
    user: deps.user,
    folderModel: deps.folderModel,
    assetModel: deps.assetModel,
    ...actorAccess,
  };
}

export function requireVisibleFolder(
  context: MediaRequestContext,
  folderId: string,
): MediaFolder {
  const folder = context.foldersById.get(folderId);
  const isVisible =
    context.access.readable.has(folderId) ||
    context.access.shells.has(folderId);
  assert(folder && isVisible, HTTP_NOT_FOUND, "Folder not found");
  return folder;
}

export function requireFolderRight(
  context: MediaRequestContext,
  folderId: string,
  right: AclRight,
): MediaFolder {
  const folder = requireVisibleFolder(context, folderId);
  const rightSets: Record<AclRight, Set<string>> = {
    read: context.access.readable,
    write: context.access.writable,
    manage: context.access.manageable,
  };
  assert(
    rightSets[right].has(folderId),
    HTTP_FORBIDDEN,
    `Missing '${right}' right on this folder`,
  );
  return folder;
}

export async function assertPermissionsManager(
  context: MediaRequestContext,
): Promise<void> {
  const allowed = await HasPermission(
    context.permissions,
    MEDIA_PERMISSIONS_MANAGE_PERMISSION,
  );
  assert(allowed, HTTP_FORBIDDEN, "Missing media permissions management");
}

export function assertNotBound(folder: MediaFolder): void {
  assert(
    !folder.binding,
    HTTP_FORBIDDEN,
    "Linked folders cannot be restructured",
  );
}

export function getDescendantFolders(
  context: MediaRequestContext,
  folderId: string,
): MediaFolder[] {
  const descendants: MediaFolder[] = [];
  const visited = new Set<string>([folderId]);
  const queue = [folderId];
  for (let index = 0; index < queue.length; index++) {
    for (const folder of context.folders) {
      if (folder.parentId !== queue[index]) continue;
      if (visited.has(folder._id)) continue;
      visited.add(folder._id);
      descendants.push(folder);
      queue.push(folder._id);
    }
  }
  return descendants;
}
