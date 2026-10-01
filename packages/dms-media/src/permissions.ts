import {
  type Permission,
  RegisterPermission,
} from "@antelopejs/interface-dms/permissions";
import {
  MEDIA_FOLDERS_MANAGE_PERMISSION,
  MEDIA_PERMISSIONS_MANAGE_PERMISSION,
  MEDIA_UPLOAD_PERMISSION,
} from "./constants";
import { MEDIA_PAGE_PERMISSION } from "./pages/media";

const MEDIA_PERMISSIONS: Permission[] = [
  {
    id: MEDIA_UPLOAD_PERMISSION,
    title: "Upload media",
    icon: "i-ph-upload-simple",
    description: "Upload files into writable folders",
    dependencies: [MEDIA_PAGE_PERMISSION],
  },
  {
    id: MEDIA_FOLDERS_MANAGE_PERMISSION,
    title: "Manage media folders",
    icon: "i-ph-folder-plus",
    description: "Create, rename, move and delete media folders",
    dependencies: [MEDIA_PAGE_PERMISSION],
  },
  {
    id: MEDIA_PERMISSIONS_MANAGE_PERMISSION,
    title: "Manage media permissions",
    icon: "i-ph-lock-key",
    description: "Edit folder access rules of the media library",
    dependencies: [MEDIA_PAGE_PERMISSION],
  },
];

for (const permission of MEDIA_PERMISSIONS) {
  RegisterPermission(permission.id, permission);
}
