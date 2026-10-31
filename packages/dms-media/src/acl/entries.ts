import { Logging } from "@antelopejs/interface-core/logging";
import type { MediaFolder } from "../db/tables";
import type { AclEntry } from "../types";

/**
 * Fails closed: an unreadable stored ACL grants nothing instead of inheriting.
 * A stored ACL that is not JSON is handled like one that is not an array:
 * logged, then read as empty.
 */
export function parseFolderAcl(folder: MediaFolder): AclEntry[] | undefined {
  if (!folder.json_acl) return undefined;
  try {
    const parsed: unknown = JSON.parse(folder.json_acl);
    if (Array.isArray(parsed)) {
      // SAFETY: json_acl is written only by serializeAcl, which stringifies an AclEntry[] (bindings.ts, declared/folders.ts), so an array read back holds AclEntry values; a schema parse of a stored row on read is excluded by ruling.
      return parsed as AclEntry[];
    }
  } catch {}
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
