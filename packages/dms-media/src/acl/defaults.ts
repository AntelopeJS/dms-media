import type { AclEntry } from "../types";

/**
 * The root grants nothing by default: owners hold every right through the
 * wildcard, and members reach media through the folders their pages link.
 */
export const DEFAULT_ROOT_ACL: AclEntry[] = [];
