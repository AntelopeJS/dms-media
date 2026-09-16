import {
  type Permission,
  RegisterPermission,
} from "@antelopejs/interface-dms/permissions";
import {
  MEDIA_ACCESS_PERMISSION,
  MEDIA_FOLDERS_MANAGE_PERMISSION,
  MEDIA_PERMISSIONS_MANAGE_PERMISSION,
  MEDIA_UPLOAD_PERMISSION,
} from "./constants";

const MEDIA_PERMISSIONS: Permission[] = [
  {
    id: MEDIA_ACCESS_PERMISSION,
    title: "Access media library",
    icon: "i-ph-images",
    description: "See the media library and browse readable folders",
  },
  {
    id: MEDIA_UPLOAD_PERMISSION,
    title: "Upload media",
    icon: "i-ph-upload-simple",
    description: "Upload files into writable folders",
    dependencies: [MEDIA_ACCESS_PERMISSION],
  },
  {
    id: MEDIA_FOLDERS_MANAGE_PERMISSION,
    title: "Manage media folders",
    icon: "i-ph-folder-plus",
    description: "Create, rename, move and delete media folders",
    dependencies: [MEDIA_ACCESS_PERMISSION],
  },
  {
    id: MEDIA_PERMISSIONS_MANAGE_PERMISSION,
    title: "Manage media permissions",
    icon: "i-ph-lock-key",
    description: "Edit folder access rules of the media library",
    dependencies: [MEDIA_ACCESS_PERMISSION],
  },
];

for (const permission of MEDIA_PERMISSIONS) {
  RegisterPermission(permission.id, permission);
}
