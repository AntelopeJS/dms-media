import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { Form } from "@antelopejs/interface-dms/base";
import { AssetType } from "@antelopejs/dms-media";

@RegisterPage()
export class MediaDemoPage extends PageController("media-demo", {
  displayName: "Media Demo",
  description: "AssetType field examples backed by the media library",
  icon: "i-ph-images",
  category: pagesCategory,
  order: 5,
}) {
  static content = Form({
    title: "$app.media_demo.form_title",
    description: "$app.media_demo.form_description",
    fieldsOrientation: "vertical",
    fields: [
      {
        id: "cover",
        label: "$app.media_demo.cover_label",
        description: "$app.media_demo.cover_description",
        type: new AssetType({
          mimetypes: ["image/*"],
          binding: {
            id: "playground.media-demo.cover",
            folderName: "Demo covers",
            permissionsFromPage: MediaDemoPage,
          },
        }),
        required: true,
      },
      {
        id: "gallery",
        label: "$app.media_demo.gallery_label",
        description: "$app.media_demo.gallery_description",
        type: new AssetType({
          multiple: true,
          max: 4,
          mimetypes: ["image/*"],
        }),
        required: false,
      },
      {
        id: "attachment",
        label: "$app.media_demo.attachment_label",
        description: "$app.media_demo.attachment_description",
        type: new AssetType({}),
        required: false,
      },
    ],
    successMessage: "$app.media_demo.success",
  });
}
