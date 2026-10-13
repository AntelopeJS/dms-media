import { Category, RegisterModule } from "@antelopejs/interface-dms/page";
import {
  mediaReadout,
  mediaStatus,
  readModuleVersion,
} from "../library/module-readout";

export const MEDIA_MODULE_ID = "media";

const TRANSPARENT_SLUG = "/";

/**
 * The media module. Its pages are the owner's administration of the library:
 * members use media through `AssetType` fields on the project's pages.
 */
export const mediaModule = RegisterModule({
  id: MEDIA_MODULE_ID,
  title: "$dms_media.title",
  description: "$dms_media.description",
  icon: "i-ph-images",
  landingPage: "overview",
  version: readModuleVersion(),
  catalogCategory: "$dms_media.catalog_category",
  status: mediaStatus,
  readout: mediaReadout,
});

/** The library itself: Overview, Library, Uploads and the hidden file pages. */
export const libraryCategory = Category("library", {
  displayName: "$dms_media.nav.library",
  category: mediaModule,
  module: MEDIA_MODULE_ID,
  icon: "i-ph-folders",
  urlSlug: TRANSPARENT_SLUG,
  type: "label",
  order: 0,
});

/** Where the library is set up: its image sizes. */
export const manageCategory = Category("manage", {
  displayName: "$dms_media.nav.settings",
  category: mediaModule,
  module: MEDIA_MODULE_ID,
  icon: "i-ph-sliders-horizontal",
  urlSlug: TRANSPARENT_SLUG,
  type: "label",
  order: 1,
});
