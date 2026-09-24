import {
  MEDIA_FOLDERS_MANAGE_PERMISSION,
  MEDIA_UPLOAD_PERMISSION,
} from "../constants";
import { MEDIA_PAGE_PERMISSION } from "../pages/media";
import type { AclEntry } from "../types";

export const DEFAULT_ROOT_ACL: AclEntry[] = [
  {
    subject: { kind: "permission", id: MEDIA_PAGE_PERMISSION },
    rights: ["read"],
  },
  {
    subject: { kind: "permission", id: MEDIA_UPLOAD_PERMISSION },
    rights: ["write"],
  },
  {
    subject: { kind: "permission", id: MEDIA_FOLDERS_MANAGE_PERMISSION },
    rights: ["manage"],
  },
];
