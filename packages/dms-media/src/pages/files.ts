import { RegisterPageTopic } from "@antelopejs/interface-dms";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  GetPermissionId,
  PageController,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { MEDIA_LIBRARY_TOPIC } from "../constants";
import { libraryCategory, MEDIA_MODULE_ID } from "./module";
import { blockMeta } from "./texts";

const TEXTS = "$dms_media.files";

@RegisterPage()
export class MediaFilesPage extends PageController(
  "files",
  {
    displayName: `${TEXTS}.title`,
    description: `${TEXTS}.description`,
    category: libraryCategory,
    module: MEDIA_MODULE_ID,
    icon: "i-ph-folders",
    order: 1,
  },
  DefaultLayout({ fillHeight: true }),
) {
  static explorer = CustomComponent("DmsMediaExplorer")
    .meta(blockMeta("explorer", "i-ph-folders"))
    .onCreated((page) => {
      if (page.pageInfo)
        RegisterPageTopic(page.pageInfo.fullId, MEDIA_LIBRARY_TOPIC);
    });
}

function requirePagePermissionId(page: typeof MediaFilesPage): string {
  const permissionId = GetPermissionId(page);
  if (!permissionId) {
    throw new Error(`Page ${page.name} has no registered permission`);
  }
  return permissionId;
}

/**
 * Permission of the Library page, `modules.media.library.files`. Module pages
 * are owner-only: the DMS never grants this id to a member, and owners reach
 * every folder through the wildcard rather than through this id.
 */
export const MEDIA_PAGE_PERMISSION = requirePagePermissionId(MediaFilesPage);
