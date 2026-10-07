import {
  type Permission,
  RegisterPermission,
} from "@antelopejs/interface-dms/permissions";
import {
  MEDIA_FOLDERS_MANAGE_PERMISSION,
  MEDIA_PERMISSIONS_MANAGE_PERMISSION,
  MEDIA_UPLOAD_PERMISSION,
} from "./constants";
import { MEDIA_PAGE_PERMISSION } from "./pages/files";

const MEDIA_PERMISSIONS: Permission[] = [
  {
    id: MEDIA_UPLOAD_PERMISSION,
    title: "$dms_media.permissions.upload.title",
    icon: "i-ph-upload-simple",
    description: "$dms_media.permissions.upload.description",
    dependencies: [MEDIA_PAGE_PERMISSION],
  },
  {
    id: MEDIA_FOLDERS_MANAGE_PERMISSION,
    title: "$dms_media.permissions.folders_manage.title",
    icon: "i-ph-folder-plus",
    description: "$dms_media.permissions.folders_manage.description",
    dependencies: [MEDIA_PAGE_PERMISSION],
  },
  {
    id: MEDIA_PERMISSIONS_MANAGE_PERMISSION,
    title: "$dms_media.permissions.permissions_manage.title",
    icon: "i-ph-lock-key",
    description: "$dms_media.permissions.permissions_manage.description",
    dependencies: [MEDIA_PAGE_PERMISSION],
  },
];

for (const permission of MEDIA_PERMISSIONS) {
  RegisterPermission(permission.id, permission);
}
