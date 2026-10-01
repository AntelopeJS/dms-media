import { Logging } from "@antelopejs/interface-core/logging";
import type { MediaFolder } from "../db/tables";
import type { AclEntry } from "../types";

/** Fails closed: an unreadable stored ACL grants nothing instead of inheriting. */
export function parseFolderAcl(folder: MediaFolder): AclEntry[] | undefined {
  if (!folder.json_acl) return undefined;
  try {
    const parsed = JSON.parse(folder.json_acl);
    if (Array.isArray(parsed)) return parsed as AclEntry[];
  } catch {
    // Handled below with the non-array case.
  }
  Logging.Warn(
    `Media folder '${folder._id}' has an unreadable ACL; treating it as empty.`,
  );
  return [];
}

export function serializeAcl(
  entries: AclEntry[] | undefined,
): string | undefined {
  if (!entries) return undefined;
  return JSON.stringify(entries);
}
