import {
  MEDIA_ACCESS_PERMISSION,
  MEDIA_FOLDERS_MANAGE_PERMISSION,
  MEDIA_UPLOAD_PERMISSION,
} from "../constants";
import type { AclEntry } from "../types";

export const DEFAULT_ROOT_ACL: AclEntry[] = [
  {
    subject: { kind: "permission", id: MEDIA_ACCESS_PERMISSION },
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
