import { createHash } from "node:crypto";
import { IsDuplicateKeyError } from "@antelopejs/interface-database";
import { GetPermissionId } from "@antelopejs/interface-dms/page";
import type { AssetBindingConfig } from "@antelopejs/interface-dms-media";
import { serializeAcl } from "./acl";
import type { MediaFolder, MediaFolderModel } from "./db";
import { fixedId } from "./fixed-id";
import type { AclEntry } from "./types";

export const CONTENT_ROOT_BINDING = "dms-media.content-root";
const CONTENT_ROOT_NAME = "Content";
const EMPTY_ACL = "[]";

const registeredBindings = new Map<string, AssetBindingConfig>();
const provisionedTenants = new Map<string, string>();
const provisioningLocks = new Map<string, Promise<void>>();

export function addAssetBinding(id: string, config: AssetBindingConfig): void {
  registeredBindings.set(id, config);
  provisionedTenants.clear();
}

export function removeAssetBinding(id: string): void {
  registeredBindings.delete(id);
  provisionedTenants.clear();
}

export function getRegisteredBindings(): AssetBindingConfig[] {
  return [...registeredBindings.values()];
}

/** Whether the folder linked to `bindingId` may hold subfolders: opt-in per binding. */
export function bindingHoldsSubfolders(bindingId: string): boolean {
  return registeredBindings.get(bindingId)?.subfolders === true;
}

/** Whether new folders may go under `folder`: any unlinked folder, a linked one when its binding allows. */
export function holdsSubfolders(folder: MediaFolder): boolean {
  return !folder.binding || bindingHoldsSubfolders(folder.binding);
}

/**
 * The binding whose field a folder's files feed: its own, or the nearest
 * linked ancestor's, since the subfolders a binding allows hold files for the
 * same field.
 */
export function feedingBinding(
  folder: MediaFolder | undefined,
  foldersById: ReadonlyMap<string, MediaFolder>,
): string | undefined {
  if (!folder) return undefined;
  if (folder.binding) return folder.binding;
  for (const ancestorId of [...folder.path].reverse()) {
    const binding = foldersById.get(ancestorId)?.binding;
    if (binding) return binding;
  }
  return undefined;
}

interface BindingFingerprintEntry {
  id: string;
  folderName?: string;
  acl: AclEntry[];
}

function registryFingerprint(): string {
  const entries: BindingFingerprintEntry[] = getRegisteredBindings()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((config) => ({
      id: config.id,
      folderName: config.folderName,
      acl: buildBindingAcl(config),
    }));
  return createHash("sha1").update(JSON.stringify(entries)).digest("hex");
}

function permissionEntries(
  permissionIds: string[] | undefined,
  rights: AclEntry["rights"],
): AclEntry[] {
  return (permissionIds ?? []).map((id) => ({
    subject: { kind: "permission" as const, id },
    rights,
  }));
}

function pagePermissionIds(config: AssetBindingConfig): string[] | undefined {
  if (!config.permissionsFromPage) return undefined;
  const permissionId = GetPermissionId(config.permissionsFromPage);
  return permissionId ? [permissionId] : undefined;
}

export function buildBindingAcl(config: AssetBindingConfig): AclEntry[] {
  if (config.acl) return config.acl;
  const pagePermissions = pagePermissionIds(config);
  return [
    ...permissionEntries(config.permissionMapping?.read ?? pagePermissions, [
      "read",
    ]),
    ...permissionEntries(config.permissionMapping?.write ?? pagePermissions, [
      "write",
    ]),
  ];
}

/**
 * The id of the folder linked to `binding` in a tenant, the content root
 * included, the same in every process: two processes provisioning one tenant
 * at once write one folder instead of two.
 */
export function bindingFolderId(tenantId: string, binding: string): string {
  return fixedId("dms-media:binding-folder", tenantId, binding);
}

/** Inserts `folder` under its fixed id. False when another process inserted it first. */
async function insertOnce(
  folderModel: MediaFolderModel,
  folder: Parameters<MediaFolderModel["insert"]>[0],
): Promise<boolean> {
  try {
    await folderModel.insert(folder);
    return true;
  } catch (error) {
    if (!IsDuplicateKeyError(error)) throw error;
    return false;
  }
}

async function ensureBindingFolder(
  tenantId: string,
  folderModel: MediaFolderModel,
  contentRootId: string,
  config: AssetBindingConfig,
): Promise<void> {
  const id = bindingFolderId(tenantId, config.id);
  const acl = serializeAcl(buildBindingAcl(config)) ?? EMPTY_ACL;
  const inserted = await insertOnce(folderModel, {
    _id: id,
    name: config.folderName ?? config.id,
    parentId: contentRootId,
    path: [contentRootId],
    binding: config.id,
    json_acl: acl,
    visibility: "private",
  });
  if (inserted) return;
  const existing = await folderModel.get(id);
  if (existing && existing.json_acl !== acl) {
    await folderModel.update(id, { json_acl: acl });
  }
}

async function provisionTenant(
  tenantId: string,
  folderModel: MediaFolderModel,
  fingerprint: string,
): Promise<void> {
  if (registeredBindings.size > 0) {
    const contentRootId = bindingFolderId(tenantId, CONTENT_ROOT_BINDING);
    await insertOnce(folderModel, {
      _id: contentRootId,
      name: CONTENT_ROOT_NAME,
      path: [],
      binding: CONTENT_ROOT_BINDING,
      json_acl: EMPTY_ACL,
      visibility: "private",
    });
    for (const config of registeredBindings.values()) {
      await ensureBindingFolder(tenantId, folderModel, contentRootId, config);
    }
  }
  provisionedTenants.set(tenantId, fingerprint);
}

export async function ensureTenantBindings(
  tenantId: string,
  folderModel: MediaFolderModel,
): Promise<void> {
  const fingerprint = registryFingerprint();
  if (provisionedTenants.get(tenantId) === fingerprint) return;
  const pending = provisioningLocks.get(tenantId);
  if (pending) return pending;
  const provisioning = provisionTenant(
    tenantId,
    folderModel,
    fingerprint,
  ).finally(() => provisioningLocks.delete(tenantId));
  provisioningLocks.set(tenantId, provisioning);
  return provisioning;
}
