import { Get, Parameter } from "@antelopejs/interface-api";
import {
  GetPermission,
  GetPermissions,
  HasPermission,
  type PermissionTree,
} from "@antelopejs/interface-dms/permissions";
import type { RoleModel } from "@antelopejs/interface-dms/db";
import { getMediaConfig } from "../../config";
import { MEDIA_PERMISSIONS_MANAGE_PERMISSION } from "../../constants";
import {
  buildInheritanceChain,
  buildRightsStats,
  loadMemberActors,
  resolveEffectiveRules,
  summarizeRights,
} from "../../library/access";
import { loadAssetsInFolders } from "../../library/listing";
import type { AclEntry } from "../../types";
import { MediaApiController } from "./controller";
import { assertPermissionsManager, requireVisibleFolder } from "./context";
import { buildFolderDto } from "./dto";

const ROOT_NAME = "$dms_media.library.root";

interface SubjectLabel {
  label: string;
  memberCount?: number;
}

interface PermissionOption {
  id: string;
  title: string;
}

function flattenPermissions(
  tree: Record<string, PermissionTree>,
): PermissionOption[] {
  const options: PermissionOption[] = [];
  const visit = (node: PermissionTree) => {
    if (node.data) options.push({ id: node.data.id, title: node.data.title });
    Object.values(node.children).forEach(visit);
  };
  Object.values(tree).forEach(visit);
  return options;
}

async function labelSubjects(
  roleModel: RoleModel,
  entries: AclEntry[],
  roleMembers: Map<string, number>,
): Promise<Map<string, SubjectLabel>> {
  const roles = await roleModel.getAll();
  const roleNames = new Map(roles.map((role) => [role._id, role.name]));
  const labels = new Map<string, SubjectLabel>();
  for (const entry of entries) {
    const key = `${entry.subject.kind}:${entry.subject.id}`;
    if (entry.subject.kind === "role") {
      labels.set(key, {
        label: roleNames.get(entry.subject.id) ?? entry.subject.id,
        memberCount: roleMembers.get(entry.subject.id) ?? 0,
      });
      continue;
    }
    const permission = await GetPermission(entry.subject.id);
    labels.set(key, { label: permission?.title ?? entry.subject.id });
  }
  return labels;
}

export class MediaAccessController extends MediaApiController {
  @Get("/folders/:folderId/access")
  async access(@Parameter("folderId", "param") folderId: string) {
    const context = await this.resolveContext();
    const folder = requireVisibleFolder(context, folderId);
    const rootAcl = getMediaConfig().rootAcl;
    const chain = buildInheritanceChain(folder, context.foldersById, ROOT_NAME);
    const rules = resolveEffectiveRules(chain, context.foldersById, rootAcl);
    const [members, canManagePermissions, assets] = await Promise.all([
      loadMemberActors({
        tenantId: context.tenantId,
        memberModel: this.memberModel,
        roleModel: this.roleModel,
      }),
      HasPermission(context.permissions, MEDIA_PERMISSIONS_MANAGE_PERMISSION),
      context.access.readable.has(folderId)
        ? loadAssetsInFolders(context.assetModel, [folderId])
        : Promise.resolve([]),
    ]);
    const roleMembers = new Map<string, number>();
    for (const { actor } of members)
      for (const roleId of actor.roleIds)
        roleMembers.set(roleId, (roleMembers.get(roleId) ?? 0) + 1);
    const labels = await labelSubjects(
      this.roleModel,
      rules.entries,
      roleMembers,
    );
    return {
      folder: buildFolderDto(context, folder),
      chain,
      sourceId: rules.sourceId,
      isOwn: rules.sourceId === folderId,
      entries: rules.entries.map((entry) => ({
        ...entry,
        ...labels.get(`${entry.subject.kind}:${entry.subject.id}`),
      })),
      rights: summarizeRights(context.folders, folderId, rootAcl, members),
      canEdit:
        canManagePermissions &&
        context.access.manageable.has(folderId) &&
        !folder.binding,
      directFiles: assets.length,
      overrides: assets
        .filter((asset) => asset.visibility !== "inherit")
        .map((asset) => ({
          id: asset._id,
          name: asset.name,
          visibility: asset.visibility,
        })),
    };
  }

  @Get("/folders/:folderId/access/stats")
  async accessStats(@Parameter("folderId", "param") folderId: string) {
    const context = await this.resolveContext();
    requireVisibleFolder(context, folderId);
    const members = await loadMemberActors({
      tenantId: context.tenantId,
      memberModel: this.memberModel,
      roleModel: this.roleModel,
    });
    const rights = summarizeRights(
      context.folders,
      folderId,
      getMediaConfig().rootAcl,
      members,
    );
    return { items: buildRightsStats(rights) };
  }

  @Get("/access/subjects")
  async subjects() {
    const context = await this.resolveContext();
    await assertPermissionsManager(context);
    const [roles, tree] = await Promise.all([
      this.roleModel.getAll(),
      GetPermissions(),
    ]);
    return {
      roles: roles.map((role) => ({ id: role._id, name: role.name })),
      permissions: flattenPermissions(tree),
    };
  }
}
