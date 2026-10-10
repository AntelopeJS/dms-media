import { GetModel } from "@antelopejs/interface-database-decorators";
import type {
  RoleModel,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import { GetEffectiveUserPermissions } from "@antelopejs/interface-dms/permissions";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  type AclActor,
  filterGrantablePermissions,
  parseFolderAcl,
  resolveFolderAccess,
} from "../acl";
import type { StatGroupItem } from "@antelopejs/interface-dms/base/stat-group";
import type { MediaFolder } from "../db";
import type { AclEntry, AclRight } from "../types";

const MEMBER_SAMPLE_SIZE = 4;

export interface AccessMember {
  userId: string;
  name: string;
}

export interface RightHolders {
  count: number;
  sample: AccessMember[];
}

export type RightsSummary = Record<AclRight, RightHolders>;

export interface MemberActor {
  member: AccessMember;
  actor: AclActor;
}

export interface MemberLookup {
  tenantId: string;
  memberModel: TenantMemberModel;
  roleModel: RoleModel;
}

/** Every member of the tenant with the permissions their roles grant. */
export async function loadMemberActors(
  lookup: MemberLookup,
): Promise<MemberActor[]> {
  const members = await lookup.memberModel.listAll();
  const userModel = GetModel(UserModel);
  const actors = await Promise.all(
    members.map(async (member): Promise<MemberActor | undefined> => {
      const user = await userModel.get(member.userId);
      if (!user) return undefined;
      const permissions = await GetEffectiveUserPermissions(
        user,
        lookup.tenantId,
        member.roleIds,
        lookup.roleModel,
      );
      return {
        member: { userId: user._id, name: user.name || user.email },
        actor: {
          permissions: await filterGrantablePermissions(permissions),
          roleIds: member.roleIds,
        },
      };
    }),
  );
  return actors.filter((entry): entry is MemberActor => entry !== undefined);
}

/** How many members hold each right on a folder, with a few of their names. */
export function summarizeRights(
  folders: MediaFolder[],
  folderId: string,
  rootAcl: AclEntry[],
  members: MemberActor[],
): RightsSummary {
  const summary: RightsSummary = {
    read: { count: 0, sample: [] },
    write: { count: 0, sample: [] },
    manage: { count: 0, sample: [] },
  };
  const rightSets: Array<
    [AclRight, keyof ReturnType<typeof resolveFolderAccess>]
  > = [
    ["read", "readable"],
    ["write", "writable"],
    ["manage", "manageable"],
  ];
  for (const { member, actor } of members) {
    const access = resolveFolderAccess(folders, actor, rootAcl);
    for (const [right, setName] of rightSets) {
      if (!access[setName].has(folderId)) continue;
      summary[right].count += 1;
      if (summary[right].sample.length < MEMBER_SAMPLE_SIZE)
        summary[right].sample.push(member);
    }
  }
  return summary;
}

const RIGHT_ICONS: Record<AclRight, string> = {
  read: "i-ph-eye",
  write: "i-ph-pencil-simple",
  manage: "i-ph-shield-check",
};
const ACCESS_TEXTS = "$dms_media.access";

/** The counters of the access page: how many members hold each right, with a few of their names. */
export function buildRightsStats(rights: RightsSummary): StatGroupItem[] {
  return (Object.keys(RIGHT_ICONS) as AclRight[]).map((right) => ({
    id: right,
    icon: RIGHT_ICONS[right],
    eyebrow: `${ACCESS_TEXTS}.can_${right}`,
    value: rights[right].count,
    detail:
      rights[right].sample.map((member) => member.name).join(", ") ||
      `${ACCESS_TEXTS}.nobody`,
  }));
}

export interface ChainLink {
  id: string | null;
  name: string;
  hasOwnAcl: boolean;
}

/** Library root, then every ancestor, then the folder itself. */
export function buildInheritanceChain(
  folder: MediaFolder,
  foldersById: Map<string, MediaFolder>,
  rootName: string,
): ChainLink[] {
  const ancestors = folder.path
    .map((id) => foldersById.get(id))
    .filter((entry): entry is MediaFolder => entry !== undefined);
  return [
    { id: null, name: rootName, hasOwnAcl: true },
    ...[...ancestors, folder].map((entry) => ({
      id: entry._id,
      name: entry.name,
      hasOwnAcl: parseFolderAcl(entry) !== undefined,
    })),
  ];
}

/** The rules that apply to a folder: its own, or the nearest ancestor's, or the root's. */
export function resolveEffectiveRules(
  chain: ChainLink[],
  foldersById: Map<string, MediaFolder>,
  rootAcl: AclEntry[],
): { sourceId: string | null; entries: AclEntry[] } {
  const source = [...chain].reverse().find((link) => link.hasOwnAcl);
  if (!source || source.id === null)
    return { sourceId: null, entries: rootAcl };
  const folder = foldersById.get(source.id);
  return {
    sourceId: source.id,
    entries: (folder && parseFolderAcl(folder)) ?? rootAcl,
  };
}
