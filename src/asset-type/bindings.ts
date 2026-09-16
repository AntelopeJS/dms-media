import { createHash } from "node:crypto";
import type { ControllerClass } from "@antelopejs/interface-api";
import { GetPermissionId } from "@antelopejs/interface-dms/page";
import { serializeAcl } from "../acl";
import {
  MEDIA_FOLDERS_MANAGE_PERMISSION,
  MEDIA_PERMISSIONS_MANAGE_PERMISSION,
} from "../constants";
import type { MediaFolder, MediaFolderModel } from "../db";
import type { AclEntry } from "../types";

export interface AssetPermissionMapping {
  read?: string[];
  write?: string[];
}

export interface AssetBindingConfig {
  id: string;
  folderName?: string;
  permissionMapping?: AssetPermissionMapping;
  /**
   * Page controller whose effective permission becomes the default read and
   * write mapping of the linked folder. Resolved lazily at provisioning time,
   * so the binding can reference the page class it is declared in. Explicit
   * `permissionMapping` entries take precedence per right: an explicit empty
   * array opts that right out of the page-derived fallback entirely.
   */
  permissionsFromPage?: ControllerClass;
  acl?: AclEntry[];
}

export const CONTENT_ROOT_BINDING = "dms-media.content-root";
const CONTENT_ROOT_NAME = "Content";
const EMPTY_ACL = "[]";

const registeredBindings = new Map<string, AssetBindingConfig>();
const provisionedTenants = new Map<string, string>();
const provisioningLocks = new Map<string, Promise<void>>();

export function RegisterAssetBinding(config: AssetBindingConfig): void {
  registeredBindings.set(config.id, config);
  provisionedTenants.clear();
}

export function getRegisteredBindings(): AssetBindingConfig[] {
  return [...registeredBindings.values()];
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
    ...permissionEntries(
      [MEDIA_FOLDERS_MANAGE_PERMISSION, MEDIA_PERMISSIONS_MANAGE_PERMISSION],
      ["manage"],
    ),
  ];
}

async function ensureContentRoot(
  folderModel: MediaFolderModel,
  foldersByBinding: Map<string, MediaFolder>,
): Promise<string> {
  const existing = foldersByBinding.get(CONTENT_ROOT_BINDING);
  if (existing) return existing._id;
  const [id] = await folderModel.insert({
    name: CONTENT_ROOT_NAME,
    path: [],
    binding: CONTENT_ROOT_BINDING,
    json_acl: EMPTY_ACL,
    visibility: "private",
  });
  return id;
}

async function ensureBindingFolder(
  folderModel: MediaFolderModel,
  foldersByBinding: Map<string, MediaFolder>,
  contentRootId: string,
  config: AssetBindingConfig,
): Promise<void> {
  const acl = serializeAcl(buildBindingAcl(config)) ?? EMPTY_ACL;
  const existing = foldersByBinding.get(config.id);
  if (existing) {
    if (existing.json_acl !== acl) {
      await folderModel.update(existing._id, { json_acl: acl });
    }
    return;
  }
  await folderModel.insert({
    name: config.folderName ?? config.id,
    parentId: contentRootId,
    path: [contentRootId],
    binding: config.id,
    json_acl: acl,
    visibility: "private",
  });
}

async function provisionTenant(
  tenantId: string,
  folderModel: MediaFolderModel,
  fingerprint: string,
): Promise<void> {
  if (registeredBindings.size > 0) {
    const folders = await folderModel.getAll();
    const foldersByBinding = new Map(
      folders
        .filter((folder) => folder.binding)
        .map((folder) => [folder.binding as string, folder]),
    );
    const contentRootId = await ensureContentRoot(
      folderModel,
      foldersByBinding,
    );
    for (const config of registeredBindings.values()) {
      await ensureBindingFolder(
        folderModel,
        foldersByBinding,
        contentRootId,
        config,
      );
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
