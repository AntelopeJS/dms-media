import {
  Category,
  PageController,
  RegisterPage,
  settingsCategory,
} from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { MEDIA_ACCESS_PERMISSION } from "../constants";

const MEDIA_LIBRARY_COMPONENT = "dms-media-library";

// Media section of the settings area, mirroring the built-in "User settings"
// group. `authOnly` keeps the section itself grant-free: pages inside carry
// the real permissions, and the settings index only shows the group when at
// least one page in it is accessible.
export const mediaSettingsCategory = Category("media", {
  category: settingsCategory,
  displayName: "Media",
  icon: "i-ph-images",
  order: 2,
  authOnly: true,
});

// Single entry point to the media library, gated by the media permission.
@RegisterPage()
export class SettingsAssetsPage extends PageController(
  "assets",
  {
    displayName: "Assets",
    icon: "i-ph-images",
    category: mediaSettingsCategory,
    description: "Browse and manage the media library",
    permission: { id: MEDIA_ACCESS_PERMISSION },
  },
  DefaultLayout({ fullWidth: true }),
) {
  static content = CustomComponent(MEDIA_LIBRARY_COMPONENT);
}
