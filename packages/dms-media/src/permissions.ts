import {
  MarkModuleScopedPermission,
  UnmarkModuleScopedPermission,
} from "@antelopejs/interface-dms/permissions";
import { RETIRED_MEDIA_PERMISSIONS } from "./constants";

/** Keeps the retired media permissions owner-only while the module runs. */
export function markRetiredPermissions(): void {
  for (const permissionId of RETIRED_MEDIA_PERMISSIONS) {
    MarkModuleScopedPermission(permissionId);
  }
}

export function unmarkRetiredPermissions(): void {
  for (const permissionId of RETIRED_MEDIA_PERMISSIONS) {
    UnmarkModuleScopedPermission(permissionId);
  }
}
