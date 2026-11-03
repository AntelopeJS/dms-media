import {
  Context,
  Controller,
  Get,
  JSONBody,
  Put,
  type RequestContext,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { Form } from "@antelopejs/interface-dms/base";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { AssetType } from "@antelopejs/interface-dms-media";
import { z } from "zod";

/** Where the field page keeps what its form saved, by field id. */
const savedValues = new Map<string, string | string[] | null>();

const VALUES = "/api/verify-media/fields";

const valuesSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string()), z.null()]),
);

/**
 * A project page holding one asset field per binding shape the docs
 * describe: a single image field with a folder taking the page's rights, a
 * PDF field capped at two files whose folder has an explicit permission
 * mapping, a multiple image field whose folder allows subfolders, a PDF field
 * without a binding, and a free attachment without a binding.
 */
@RegisterPage()
export class FieldsPage extends PageController("verify-fields", {
  displayName: "Verify fields",
  category: pagesCategory,
  order: 5,
}) {
  static content = Form({
    title: "Asset fields",
    fieldsOrientation: "vertical",
    fetchUrl: `${VALUES}/values`,
    submitUrl: `${VALUES}/values`,
    fields: [
      {
        id: "cover",
        label: "Cover",
        type: new AssetType({
          mimetypes: ["image/*"],
          binding: {
            id: "verify.cover",
            folderName: "Verify covers",
            permissionsFromPage: FieldsPage,
          },
        }),
        required: false,
      },
      {
        id: "sheets",
        label: "Sheets",
        type: new AssetType({
          multiple: true,
          max: 2,
          mimetypes: ["application/pdf"],
          binding: {
            id: "verify.sheets",
            permissionMapping: {
              read: ["verify.sheets.read"],
              write: ["verify.sheets.write"],
            },
          },
        }),
        required: false,
      },
      {
        id: "projects",
        label: "Projects",
        type: new AssetType({
          multiple: true,
          mimetypes: ["image/*"],
          binding: {
            id: "verify.projects",
            folderName: "Verify projects",
            subfolders: true,
            permissionsFromPage: FieldsPage,
          },
        }),
        required: false,
      },
      {
        id: "pdf",
        label: "PDF only",
        type: new AssetType({ mimetypes: ["application/pdf"] }),
        required: false,
      },
      {
        id: "attachment",
        label: "Attachment",
        type: new AssetType({}),
        required: false,
      },
    ],
  });
}

/**
 * A page every member opens without a grant (`memberAccess`), whose field's
 * folder takes the page's rights: the docs say such a page grants no folder
 * right.
 */
@RegisterPage()
export class OpenPage extends PageController("verify-open", {
  displayName: "Verify open page",
  category: pagesCategory,
  order: 6,
  memberAccess: true,
}) {
  static content = Form({
    title: "Open field",
    fields: [
      {
        id: "open",
        label: "Open",
        type: new AssetType({
          binding: { id: "verify.open", permissionsFromPage: OpenPage },
        }),
        required: false,
      },
    ],
  });
}

/** Keeps what the field page's form saves, so a journey reads it back. */
export class FieldValuesController extends Controller(VALUES) {
  @Context()
  declare ctx: RequestContext;

  @AuthUserWithPermission(FieldsPage)
  declare user: User;

  @Get("/values")
  values(): Record<string, string | string[] | null> {
    return Object.fromEntries(savedValues);
  }

  @Put("/values")
  save(@JSONBody() body: unknown): Record<string, string | string[] | null> {
    const sent = valuesSchema.safeParse(body);
    for (const [id, value] of Object.entries(sent.success ? sent.data : {}))
      savedValues.set(id, value);
    return Object.fromEntries(savedValues);
  }
}
