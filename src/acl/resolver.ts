import { OWNER_WILDCARD_PERMISSION } from "../constants";
import type { MediaFolder } from "../db/tables";
import type { AclEntry, AclRight, AclSubjectKind } from "../types";
import { parseFolderAcl } from "./entries";

export interface AclActor {
  permissions: ReadonlySet<string>;
  roleIds: readonly string[];
}

export interface FolderAccess {
  readable: Set<string>;
  writable: Set<string>;
  manageable: Set<string>;
  /** Ancestors of readable folders that are not readable themselves: navigable shells whose content must never be listed. */
  shells: Set<string>;
}

interface FolderVisit {
  folder: MediaFolder;
  inherited: ReadonlySet<AclRight>;
}

const ALL_RIGHTS: readonly AclRight[] = ["read", "write", "manage"];

const RIGHT_IMPLICATIONS: Record<AclRight, readonly AclRight[]> = {
  read: ["read"],
  write: ["read", "write"],
  manage: ["read", "write", "manage"],
};

const SUBJECT_MATCHERS: Record<
  AclSubjectKind,
  (id: string, actor: AclActor) => boolean
> = {
  permission: (id, actor) =>
    actor.permissions.has(OWNER_WILDCARD_PERMISSION) ||
    actor.permissions.has(id),
  role: (id, actor) => actor.roleIds.includes(id),
};

export function resolveRootRights(
  actor: AclActor,
  rootAcl: readonly AclEntry[],
): Set<AclRight> {
  if (actor.permissions.has(OWNER_WILDCARD_PERMISSION)) {
    return new Set(ALL_RIGHTS);
  }
  return evaluateAclEntries(rootAcl, actor);
}

export function evaluateAclEntries(
  entries: readonly AclEntry[],
  actor: AclActor,
): Set<AclRight> {
  const granted = new Set<AclRight>();
  for (const entry of entries) {
    const matches = SUBJECT_MATCHERS[entry.subject.kind];
    if (!matches?.(entry.subject.id, actor)) continue;
    for (const right of entry.rights) {
      for (const implied of RIGHT_IMPLICATIONS[right] ?? []) {
        granted.add(implied);
      }
    }
  }
  return granted;
}

export function resolveFolderAccess(
  folders: readonly MediaFolder[],
  actor: AclActor,
  rootAcl: readonly AclEntry[],
): FolderAccess {
  if (actor.permissions.has(OWNER_WILDCARD_PERMISSION)) {
    return buildFullAccess(folders);
  }
  const access = buildEmptyAccess();
  const childrenByParent = groupChildrenByParent(folders);
  const queue: FolderVisit[] = collectRoots(folders).map((folder) => ({
    folder,
    inherited: evaluateAclEntries(rootAcl, actor),
  }));
  for (let index = 0; index < queue.length; index++) {
    const { folder, inherited } = queue[index];
    const ownAcl = parseFolderAcl(folder);
    const rights = ownAcl ? evaluateAclEntries(ownAcl, actor) : inherited;
    collectFolderRights(access, folder._id, rights);
    for (const child of childrenByParent.get(folder._id) ?? []) {
      queue.push({ folder: child, inherited: rights });
    }
  }
  collectAncestorShells(folders, access);
  return access;
}

function buildEmptyAccess(): FolderAccess {
  return {
    readable: new Set(),
    writable: new Set(),
    manageable: new Set(),
    shells: new Set(),
  };
}

function buildFullAccess(folders: readonly MediaFolder[]): FolderAccess {
  const ids = folders.map((folder) => folder._id);
  return {
    readable: new Set(ids),
    writable: new Set(ids),
    manageable: new Set(ids),
    shells: new Set(),
  };
}

function groupChildrenByParent(
  folders: readonly MediaFolder[],
): Map<string, MediaFolder[]> {
  const childrenByParent = new Map<string, MediaFolder[]>();
  for (const folder of folders) {
    if (!folder.parentId) continue;
    const siblings = childrenByParent.get(folder.parentId) ?? [];
    siblings.push(folder);
    childrenByParent.set(folder.parentId, siblings);
  }
  return childrenByParent;
}

function collectRoots(folders: readonly MediaFolder[]): MediaFolder[] {
  const knownIds = new Set(folders.map((folder) => folder._id));
  return folders.filter(
    (folder) => !folder.parentId || !knownIds.has(folder.parentId),
  );
}

function collectFolderRights(
  access: FolderAccess,
  folderId: string,
  rights: ReadonlySet<AclRight>,
): void {
  if (rights.has("read")) access.readable.add(folderId);
  if (rights.has("write")) access.writable.add(folderId);
  if (rights.has("manage")) access.manageable.add(folderId);
}

function collectAncestorShells(
  folders: readonly MediaFolder[],
  access: FolderAccess,
): void {
  const foldersById = new Map(folders.map((folder) => [folder._id, folder]));
  for (const folderId of access.readable) {
    let current = foldersById.get(folderId);
    while (current?.parentId) {
      const parent = foldersById.get(current.parentId);
      if (!parent || access.shells.has(parent._id)) break;
      if (!access.readable.has(parent._id)) access.shells.add(parent._id);
      current = parent;
    }
  }
}
