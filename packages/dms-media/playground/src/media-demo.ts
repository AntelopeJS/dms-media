import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { Form } from "@antelopejs/interface-dms/base";
import { AssetType } from "@antelopejs/interface-dms-media";

const TEXTS = "$app.media_demo";
/** Base path of the routes keeping what the demo form saves. */
export const MEDIA_DEMO_VALUES_LOCATION = "/api/playground/media-demo";
const VALUES_URL = `${MEDIA_DEMO_VALUES_LOCATION}/values`;
const FIELD_IDS = {
  cover: "cover",
  gallery: "gallery",
  specSheet: "specSheet",
  documents: "documents",
  attachment: "attachment",
} as const;
/** The fields the demo form saves. */
export const MEDIA_DEMO_FIELD_IDS: readonly string[] = Object.values(FIELD_IDS);
const GALLERY_MAX = 4;
const DOCUMENTS_MAX = 3;
const IMAGE_MIMETYPES = ["image/*"];
const PDF_MIMETYPES = ["application/pdf"];
const DOCUMENT_MIMETYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

@RegisterPage()
export class MediaDemoPage extends PageController("media-demo", {
  displayName: `${TEXTS}.page_title`,
  description: `${TEXTS}.page_description`,
  icon: "i-ph-images",
  category: pagesCategory,
  order: 5,
}) {
  static content = Form({
    title: `${TEXTS}.form_title`,
    description: `${TEXTS}.form_description`,
    fieldsOrientation: "vertical",
    fetchUrl: VALUES_URL,
    submitUrl: VALUES_URL,
    fields: [
      {
        id: FIELD_IDS.cover,
        label: `${TEXTS}.cover_label`,
        description: `${TEXTS}.cover_description`,
        type: new AssetType({
          mimetypes: IMAGE_MIMETYPES,
          binding: {
            id: "playground.media-demo.cover",
            folderName: "Demo covers",
            permissionsFromPage: MediaDemoPage,
          },
        }),
        required: true,
      },
      {
        id: FIELD_IDS.gallery,
        label: `${TEXTS}.gallery_label`,
        description: `${TEXTS}.gallery_description`,
        type: new AssetType({
          multiple: true,
          max: GALLERY_MAX,
          mimetypes: IMAGE_MIMETYPES,
        }),
        required: false,
      },
      {
        id: FIELD_IDS.specSheet,
        label: `${TEXTS}.spec_sheet_label`,
        description: `${TEXTS}.spec_sheet_description`,
        type: new AssetType({ mimetypes: PDF_MIMETYPES }),
        required: false,
      },
      {
        id: FIELD_IDS.documents,
        label: `${TEXTS}.documents_label`,
        description: `${TEXTS}.documents_description`,
        type: new AssetType({
          multiple: true,
          max: DOCUMENTS_MAX,
          mimetypes: DOCUMENT_MIMETYPES,
          binding: {
            id: "playground.media-demo.documents",
            folderName: "Demo documents",
            permissionsFromPage: MediaDemoPage,
          },
        }),
        required: false,
      },
      {
        id: FIELD_IDS.attachment,
        label: `${TEXTS}.attachment_label`,
        description: `${TEXTS}.attachment_description`,
        type: new AssetType({}),
        required: false,
      },
    ],
    successMessage: `${TEXTS}.success`,
  });
}
