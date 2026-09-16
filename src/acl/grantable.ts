import { IsModuleScopedPermission } from "@antelopejs/interface-dms/permissions";
import { OWNER_WILDCARD_PERMISSION } from "../constants";

export function filterGrantablePermissions(
  permissions: Set<string>,
): Set<string> {
  if (permissions.has(OWNER_WILDCARD_PERMISSION)) return permissions;
  return new Set(
    [...permissions].filter((id) => !IsModuleScopedPermission(id)),
  );
}
