import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { libraryCategory } from "./category";
import { blockMeta } from "./texts";

const ASSET_QUERY_PARAM = "asset";

@RegisterPage()
export class MediaFilePage extends PageController("file", {
  displayName: "$dms_media.file.title",
  description: "$dms_media.file.description",
  category: libraryCategory,
  icon: "i-ph-file-image",
  hidden: true,
  order: 3,
  validation: { requiredQueryParams: [ASSET_QUERY_PARAM] },
}) {
  static details = CustomComponent("DmsMediaFileDetails").meta(
    blockMeta("file_details", "i-ph-file-image"),
  );
}

@RegisterPage()
export class MediaEditorPage extends PageController("editor", {
  displayName: "$dms_media.editor.title",
  description: "$dms_media.editor.description",
  category: libraryCategory,
  icon: "i-ph-crop",
  hidden: true,
  order: 4,
  validation: { requiredQueryParams: [ASSET_QUERY_PARAM] },
}) {
  static editor = CustomComponent("DmsMediaImageEditor").meta(
    blockMeta("image_editor", "i-ph-crop"),
  );
}
