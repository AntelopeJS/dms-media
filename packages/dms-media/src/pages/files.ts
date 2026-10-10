import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  GetPermissionId,
  PageController,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { libraryCategory } from "./category";
import { blockMeta } from "./texts";

const TEXTS = "$dms_media.files";

@RegisterPage()
export class MediaFilesPage extends PageController(
  "files",
  {
    displayName: `${TEXTS}.title`,
    description: `${TEXTS}.description`,
    category: libraryCategory,
    icon: "i-ph-folders",
    order: 1,
  },
  DefaultLayout({ fillHeight: true }),
) {
  static explorer = CustomComponent("DmsMediaExplorer").meta(
    blockMeta("explorer", "i-ph-folders"),
  );
}

function requirePagePermissionId(page: typeof MediaFilesPage): string {
  const permissionId = GetPermissionId(page);
  if (!permissionId) {
    throw new Error(`Page ${page.name} has no registered permission`);
  }
  return permissionId;
}

/** Permission of the All files page: the default root ACL grants it `read`. */
export const MEDIA_PAGE_PERMISSION = requirePagePermissionId(MediaFilesPage);
