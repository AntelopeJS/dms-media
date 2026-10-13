import { HasPermission } from "@antelopejs/interface-dms/permissions";
import { OWNER_WILDCARD_PERMISSION } from "../constants";

/**
 * The permissions of a set the DMS actually grants: module-scoped ids drop
 * out, and so does a grant whose ancestors or dependencies are not held, so
 * an ACL subject matches exactly when `HasPermission` would allow it.
 */
export async function filterGrantablePermissions(
  permissions: Set<string>,
): Promise<Set<string>> {
  if (permissions.has(OWNER_WILDCARD_PERMISSION)) return permissions;
  const ids = [...permissions];
  const granted = await Promise.all(
    ids.map((id) => HasPermission(permissions, id)),
  );
  return new Set(ids.filter((_, index) => granted[index]));
}
