import type { MediaFolder } from "../db/tables";
import type { AclEntry } from "../types";

export function parseFolderAcl(folder: MediaFolder): AclEntry[] | undefined {
  if (!folder.json_acl) return undefined;
  try {
    const parsed = JSON.parse(folder.json_acl);
    return Array.isArray(parsed) ? (parsed as AclEntry[]) : undefined;
  } catch {
    return undefined;
  }
}

export function serializeAcl(
  entries: AclEntry[] | undefined,
): string | undefined {
  if (!entries) return undefined;
  return JSON.stringify(entries);
}
