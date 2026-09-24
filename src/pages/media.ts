import {
  Category,
  GetPermissionId,
  PageController,
  RegisterPage,
  settingsCategory,
} from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";

const MEDIA_LIBRARY_COMPONENT = "dms-media-library";

// Media section of the settings area, mirroring the built-in "User settings"
// group. Pages inside carry their own default permissions, and the settings
// index only shows the group when at least one page in it is accessible.
export const mediaSettingsCategory = Category("media", {
  category: settingsCategory,
  displayName: "Media",
  icon: "i-ph-images",
  order: 2,
});

// Single entry point to the media library, gated by its default page permission.
@RegisterPage()
export class SettingsAssetsPage extends PageController(
  "assets",
  {
    displayName: "Assets",
    icon: "i-ph-images",
    category: mediaSettingsCategory,
    description: "Browse and manage the media library",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static content = CustomComponent(MEDIA_LIBRARY_COMPONENT);
}

function requirePagePermissionId(page: typeof SettingsAssetsPage): string {
  const permissionId = GetPermissionId(page);
  if (!permissionId) {
    throw new Error(`Page ${page.name} has no registered permission`);
  }
  return permissionId;
}

export const MEDIA_PAGE_PERMISSION =
  requirePagePermissionId(SettingsAssetsPage);
