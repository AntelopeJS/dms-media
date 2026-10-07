import { Category, RootCategory } from "@antelopejs/interface-dms/page";

export const MEDIA_ROOT_ID = "media";

export const mediaRootCategory = RootCategory(MEDIA_ROOT_ID, {
  displayName: "$dms_media.title",
  description: "$dms_media.description",
  icon: "i-ph-images",
  urlSlug: "media",
  order: 1,
});

export const libraryCategory = Category("library", {
  displayName: "$dms_media.nav.library",
  category: mediaRootCategory,
  icon: "i-ph-folders",
  type: "label",
  urlSlug: "/",
  order: 0,
});

export const manageCategory = Category("manage", {
  displayName: "$dms_media.nav.manage",
  category: mediaRootCategory,
  icon: "i-ph-sliders-horizontal",
  type: "label",
  urlSlug: "/",
  order: 1,
});

export const developersCategory = Category("developers", {
  displayName: "$dms_media.nav.developers",
  category: mediaRootCategory,
  icon: "i-ph-code",
  type: "label",
  urlSlug: "/",
  order: 2,
});
