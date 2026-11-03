import { randomUUID } from "node:crypto";
import {
  Controller,
  Delete,
  Get,
  JSONBody,
  Parameter,
  Post,
} from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  CreateDataType,
  serializeType,
} from "@antelopejs/interface-dms/base/data-types";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { GetPermissionId } from "@antelopejs/interface-dms/page";
import { RoleModel, UserInviteModel } from "@antelopejs/interface-dms/db";
import {
  ASSET_DATA_TYPE_ID,
  ASSET_PICKER_COMPONENT,
  AssetType,
  EnsureMediaFolder,
  ImportMediaAsset,
  type MediaAssetSource,
  type MediaDeclarationResult,
  RegisterAssetBinding,
  UnregisterAssetBinding,
} from "@antelopejs/interface-dms-media";
import { z } from "zod";
import { FieldsPage, OpenPage } from "./pages";

const INVITE_LIFETIME_MS = 3_600_000;

const PAGES = { fields: FieldsPage, open: OpenPage };

const rightSchema = z.enum(["read", "write", "manage"]);
const aclSchema = z.array(
  z.object({
    subject: z.object({ kind: z.enum(["permission", "role"]), id: z.string() }),
    rights: z.array(rightSchema),
  }),
);
const targetSchema = z.union([
  z.object({ key: z.string() }),
  z.object({ binding: z.string() }),
]);

const memberSchema = z.object({
  name: z.string(),
  permissions: z.array(z.string()),
  language: z.string().default("en"),
});

const folderSchema = z.object({
  tenantId: z.unknown(),
  key: z.string(),
  name: z.string(),
  parent: z.union([z.string(), targetSchema]).optional(),
  visibility: z.enum(["private", "public"]).optional(),
  acl: aclSchema.optional(),
});

const assetSchema = z.object({
  tenantId: z.unknown(),
  key: z.string(),
  folder: targetSchema,
  name: z.string(),
  mimetype: z.string(),
  alt: z.string().optional(),
  source: z.object({
    kind: z.enum(["bytes", "filePath", "load"]),
    base64: z.string().optional(),
    filePath: z.string().optional(),
  }),
});

const bindingSchema = z.object({
  id: z.string(),
  folderName: z.string().optional(),
  permissionMapping: z
    .object({
      read: z.array(z.string()).optional(),
      write: z.array(z.string()).optional(),
    })
    .optional(),
  permissionsFromPage: z.enum(["fields", "open"]).optional(),
  acl: aclSchema.optional(),
  subfolders: z.boolean().optional(),
  mimetypes: z.array(z.string()).optional(),
});

const validationSchema = z.object({
  options: z.object({
    multiple: z.boolean().optional(),
    max: z.number().optional(),
    mimetypes: z.array(z.string()).optional(),
  }),
  values: z.array(z.unknown()),
});

/** What a trusted backend call answered: its result, or the message it rejected with. */
type Outcome =
  | { ok: true; result: MediaDeclarationResult; loads: number }
  | { ok: false; error: string; loads: number };

/**
 * A role's permissions as a journey names them: `page:fields` and `page:open`
 * stand for the page's own id and its form block's, as the roles editor
 * grants a page.
 */
function permissionsOf(name: string): string[] {
  if (name === "page:fields")
    return [GetPermissionId(FieldsPage), GetPermissionId(FieldsPage.content)].flatMap((id) => id ?? []);
  if (name === "page:open")
    return [GetPermissionId(OpenPage), GetPermissionId(OpenPage.content)].flatMap((id) => id ?? []);
  return [name];
}

/** The ids of the permissions a role holds, with every id its grants sit under, as the DMS roles editor stores them. */
function withAncestors(permissions: string[]): string[] {
  return [
    ...new Set(
      permissions.flatMap((id) => {
        const segments = id.split(".");
        return segments.map((_, index) =>
          segments.slice(0, index + 1).join("."),
        );
      }),
    ),
  ];
}

/** `tenantId` as sent: a string as it is, any other value as the empty string a careless caller sends. */
const tenantSchema = z.string().catch("");

async function outcome(
  call: () => Promise<MediaDeclarationResult>,
  loads: () => number,
): Promise<Outcome> {
  try {
    return { ok: true, result: await call(), loads: loads() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      loads: loads(),
    };
  }
}

function sourceOf(
  source: z.infer<typeof assetSchema>["source"],
  counted: { loads: number },
): MediaAssetSource {
  const bytes = Buffer.from(source.base64 ?? "", "base64");
  if (source.kind === "filePath") return { filePath: source.filePath ?? "" };
  if (source.kind === "load")
    return {
      load: () => {
        counted.loads += 1;
        return new Uint8Array(bytes);
      },
    };
  return { bytes: new Uint8Array(bytes) };
}

/**
 * Trusted backend calls a journey cannot make over HTTP: members with a role,
 * the interface's declaration functions, runtime bindings and the asset
 * field's validation. Only the verification playground serves them.
 */
export class VerifyFixtureController extends Controller("/verify-media") {
  @Post("/member")
  async member(@JSONBody() body: unknown) {
    const { name, permissions, language } = memberSchema.parse(body);
    const [roleId] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
      name: `${name} ${randomUUID()}`,
      permissions: withAncestors(permissions.flatMap(permissionsOf)),
    });
    const token = randomUUID();
    const email = `${name.toLowerCase()}-${randomUUID()}@verify.local`;
    await GetModel(UserInviteModel, DEFAULT_TENANT_ID).insert({
      email,
      roles_ids: roleId === undefined ? [] : [roleId],
      language,
      token,
      asTenantOwner: false,
      expiresAt: new Date(Date.now() + INVITE_LIFETIME_MS),
    });
    return { email, token, roleId };
  }

  @Get("/permissions")
  permissions() {
    return { fields: GetPermissionId(FieldsPage), fieldsForm: GetPermissionId(FieldsPage.content), open: GetPermissionId(OpenPage) };
  }

  @Post("/folder")
  folder(@JSONBody() body: unknown) {
    const { tenantId, ...declaration } = folderSchema.parse(body);
    return outcome(
      () => EnsureMediaFolder({ ...declaration, tenantId: tenantSchema.parse(tenantId) }),
      () => 0,
    );
  }

  @Post("/asset")
  asset(@JSONBody() body: unknown) {
    const { tenantId, source, ...declaration } = assetSchema.parse(body);
    const counted = { loads: 0 };
    return outcome(
      () =>
        ImportMediaAsset({
          ...declaration,
          source: sourceOf(source, counted),
          tenantId: tenantSchema.parse(tenantId),
        }),
      () => counted.loads,
    );
  }

  @Post("/binding")
  register(@JSONBody() body: unknown) {
    const { permissionsFromPage, mimetypes, ...config } =
      bindingSchema.parse(body);
    RegisterAssetBinding({
      ...config,
      permissionsFromPage:
        permissionsFromPage === undefined
          ? undefined
          : PAGES[permissionsFromPage],
      field: mimetypes === undefined ? undefined : { mimetypes },
    });
    return { ok: true };
  }

  @Delete("/binding/:id")
  unregister(@Parameter("id") id: string) {
    UnregisterAssetBinding(id);
    return { ok: true };
  }

  @Post("/validate")
  validate(@JSONBody() body: unknown) {
    const { options, values } = validationSchema.parse(body);
    const schema = new AssetType(options).getValidation();
    return {
      accepted: values.map((value) => schema.safeParse(value).success),
    };
  }

  @Get("/constants")
  constants() {
    const bound = new AssetType({
      multiple: true,
      max: 3,
      mimetypes: ["image/png"],
      binding: { id: "verify.constants", acl: [] },
    });
    return {
      dataType: ASSET_DATA_TYPE_ID,
      component: ASSET_PICKER_COMPONENT,
      registered: CreateDataType(ASSET_DATA_TYPE_ID, {}) instanceof AssetType,
      serialized: serializeType(bound),
    };
  }
}
