import { CodeBlock } from "@antelopejs/interface-dms/base/code-block";
import { Form } from "@antelopejs/interface-dms/base/form";
import { KeyValueList } from "@antelopejs/interface-dms/base/key-value-list";
import { Section } from "@antelopejs/interface-dms/base/section";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { AssetType } from "@antelopejs/interface-dms-media";
import { developersCategory } from "./category";
import { blockMeta } from "./texts";

const TEXTS = "$dms_media.field";
const GALLERY_MAX = 8;
const FIELD_NOTES = ["value", "binding", "rights"] as const;
const DEPENDENCY_SNIPPET = "pnpm add @antelopejs/interface-dms-media";
const DECLARATION_SNIPPET = `import { AssetType } from "@antelopejs/interface-dms-media";

new AssetType({
  multiple: true,
  max: ${GALLERY_MAX},
  mimetypes: ["image/*"],
  binding: {
    id: "products.gallery",
    folderName: "Product gallery",
    permissionsFromPage: ProductsPage,
  },
});`;

const demoForm = Form({
  title: `${TEXTS}.demo.title`,
  description: `${TEXTS}.demo.description`,
  saveMode: "none",
  fields: [
    {
      id: "cover",
      label: `${TEXTS}.demo.cover`,
      description: `${TEXTS}.demo.cover_description`,
      type: new AssetType({ mimetypes: ["image/*"] }),
    },
    {
      id: "gallery",
      label: `${TEXTS}.demo.gallery`,
      description: `${TEXTS}.demo.gallery_description`,
      type: new AssetType({
        multiple: true,
        max: GALLERY_MAX,
        mimetypes: ["image/*"],
      }),
    },
    {
      id: "specSheet",
      label: `${TEXTS}.demo.spec_sheet`,
      description: `${TEXTS}.demo.spec_sheet_description`,
      type: new AssetType({ mimetypes: ["application/pdf"] }),
    },
  ],
}).meta(blockMeta("field_demo", "i-ph-selection-plus"));

@RegisterPage()
export class MediaFieldPage extends PageController("field", {
  displayName: `${TEXTS}.title`,
  description: `${TEXTS}.description`,
  category: developersCategory,
  icon: "i-ph-selection-plus",
  order: 0,
}) {
  static demo = demoForm;

  static declaration = Section({
    title: `${TEXTS}.code.title`,
    description: `${TEXTS}.code.description`,
  })
    .meta(blockMeta("field_code", "i-ph-code"))
    .child(
      "dependency",
      CodeBlock({
        title: "shell",
        language: "shell",
        code: DEPENDENCY_SNIPPET,
      }).meta(blockMeta("field_dependency", "i-ph-terminal")),
    )
    .child(
      "snippet",
      CodeBlock({
        title: "src/pages/products.ts",
        language: "typescript",
        code: DECLARATION_SNIPPET,
      }).meta(blockMeta("field_snippet", "i-ph-code")),
    )
    .child(
      "notes",
      KeyValueList({
        card: false,
        dense: true,
        items: FIELD_NOTES.map((note) => ({
          id: note,
          label: `${TEXTS}.code.notes_labels.${note}`,
          value: `${TEXTS}.code.notes.${note}`,
        })),
      }).meta(blockMeta("field_notes", "i-ph-info")),
    );
}
