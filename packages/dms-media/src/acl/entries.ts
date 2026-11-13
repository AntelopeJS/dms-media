import { Logging } from "@antelopejs/interface-core/logging";
import type { MediaFolder } from "../db/tables";
import { isObject, isString } from "../guards";
import type { AclEntry, AclRight, AclSubject } from "../types";

function isAclRight(value: unknown): value is AclRight {
  return value === "read" || value === "write" || value === "manage";
}

function isAclSubject(value: unknown): value is AclSubject {
  return (
    isObject(value) &&
    "kind" in value &&
    (value.kind === "permission" || value.kind === "role") &&
    "id" in value &&
    isString(value.id)
  );
}

function isAclEntry(value: unknown): value is AclEntry {
  return (
    isObject(value) &&
    "subject" in value &&
    isAclSubject(value.subject) &&
    "rights" in value &&
    Array.isArray(value.rights) &&
    value.rights.every(isAclRight)
  );
}

/**
 * Fails closed: an unreadable stored ACL grants nothing instead of inheriting.
 * A stored ACL that is not JSON, not an array, or holds an entry that is not
 * an ACL entry is logged, then read as empty.
 */
export function parseFolderAcl(folder: MediaFolder): AclEntry[] | undefined {
  if (!folder.json_acl) return undefined;
  try {
    const parsed: unknown = JSON.parse(folder.json_acl);
    if (Array.isArray(parsed) && parsed.every(isAclEntry)) return parsed;
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
