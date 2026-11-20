import { randomUUID } from "node:crypto";
import { assert } from "@antelopejs/interface-api-util";
import type { JsonObject } from "@antelopejs/interface-dms-automation";
import { z } from "zod";
import { feedingBinding } from "../../bindings";
import type { MediaAsset, MediaDeclaration, MediaFolder } from "../../db";
import {
  AUTOMATION_AUTHOR,
  declaredId,
  declaredModels,
  rememberDeclaration,
  withDeclarationLock,
} from "../../declared/records";
import { loadNamesContaining } from "../../library/listing";
import type { MediaRequestContext } from "../../routes/media/context";
import { buildDeliveryPath } from "../../routes/media/dto";
import {
  type PreparedFile,
  prepareFile,
  recordAddedFile,
  storeNewFile,
} from "../../services/add-file";
import { copyStem, suggestFreeNames } from "../../upload-names";
import {
  altSchema,
  fileNameSchema,
  MEDIA_ERRORS,
} from "../../validation/media.schema";
import {
  BINDING_INPUT,
  FOLDER_ID_INPUT,
  folderTargetFields,
  objectSchema,
  ONE_FOLDER_TARGET,
  oneFolderTarget,
  parseInput,
  requireTargetFolder,
  TENANT_INPUT,
  tenantIdField,
  writeAction,
} from "./support";

const ACTION_ID = "media.create-file";
/** Content travels as a port value stored in the run: bigger files belong to uploads. */
const MAX_CREATED_FILE_BYTES = 1024 * 1024;
const MAX_KEY_LENGTH = 200;
const HTTP_CONFLICT = 409;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const BASE64_BLOCK = 4;
const WHITESPACE = /\s+/g;

const input = z
  .object({
    tenantId: tenantIdField,
    ...folderTargetFields,
    name: fileNameSchema,
    content: z.string(),
    encoding: z.enum(["utf8", "base64"]).default("utf8"),
    mimetype: z.string().trim().min(1).max(100),
    alt: altSchema.optional(),
    onNameConflict: z.enum(["rename", "fail"]).default("rename"),
    key: z
      .string()
      .trim()
      .max(MAX_KEY_LENGTH)
      .optional()
      .transform((value) => value || undefined),
  })
  .refine(oneFolderTarget, ONE_FOLDER_TARGET)
  .transform((value, ctx) => {
    const bytes = decodeContent(value.content, value.encoding);
    if (!bytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: "not valid base64",
      });
      return z.NEVER;
    }
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_CREATED_FILE_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: `the file must hold 1 to ${MAX_CREATED_FILE_BYTES} bytes`,
      });
      return z.NEVER;
    }
    return { ...value, bytes };
  });

type CreateInput = z.output<typeof input>;

function decodeContent(
  content: string,
  encoding: "utf8" | "base64",
): Buffer | undefined {
  if (encoding === "utf8") return Buffer.from(content, "utf8");
  const compact = content.replace(WHITESPACE, "");
  if (compact.length % BASE64_BLOCK !== 0 || !BASE64.test(compact))
    return undefined;
  return Buffer.from(compact, "base64");
}

/** The declaration key a procedure's `key` is remembered under, apart from declared content's. */
const automationKey = (key: string) => `automation:${key}`;

/** The key's file exists: nothing is written. */
interface KeptPlan {
  kept: MediaAsset;
  folder: MediaFolder;
}

/** A new file, checked and ready to store. */
interface NewFilePlan {
  kept?: undefined;
  folder: MediaFolder;
  name: string;
  alt?: string;
  file: PreparedFile;
  id: string;
  key?: string;
  record?: MediaDeclaration;
}

type CreatePlan = KeptPlan | NewFilePlan;

async function findKeyed(
  context: MediaRequestContext,
  key: string,
): Promise<{ record?: MediaDeclaration; asset?: MediaAsset }> {
  const record = await declaredModels(
    context.tenantId,
  ).declarationModel.findByKey("asset", automationKey(key));
  if (!record) return {};
  const asset = await context.assetModel.get(record.targetId);
  return { record, asset: asset && !asset.isDeleting ? asset : undefined };
}

async function finalName(
  context: MediaRequestContext,
  folder: MediaFolder,
  value: CreateInput,
): Promise<string> {
  const existing = await loadNamesContaining(context.assetModel, folder._id, [
    copyStem(value.name),
  ]);
  const [free] = suggestFreeNames(existing, [value.name]);
  if (!free) return value.name;
  assert(
    value.onNameConflict === "rename",
    HTTP_CONFLICT,
    MEDIA_ERRORS.nameTaken,
  );
  return free;
}

function idFor(
  context: MediaRequestContext,
  key: string | undefined,
  record: MediaDeclaration | undefined,
): string {
  if (!key || record) return randomUUID();
  return declaredId(context.tenantId, "asset", automationKey(key));
}

async function planOf(
  context: MediaRequestContext,
  value: CreateInput,
): Promise<CreatePlan> {
  const folder = requireTargetFolder(context, value);
  const keyed = value.key ? await findKeyed(context, value.key) : {};
  if (keyed.asset) return { kept: keyed.asset, folder };
  const name = await finalName(context, folder, value);
  const file = await prepareFile(
    {
      assetModel: context.assetModel,
      fieldBinding: feedingBinding(folder, context.foldersById),
      name,
      mimetype: value.mimetype,
    },
    value.bytes,
  );
  return {
    folder,
    name,
    alt: value.alt,
    file,
    id: idFor(context, value.key, keyed.record),
    key: value.key,
    record: keyed.record,
  };
}

function keptOutput(asset: MediaAsset) {
  return {
    assetId: asset._id,
    status: "kept",
    name: asset.name,
    mimetype: asset.mimetype,
    size: asset.size,
    width: asset.width ?? null,
    height: asset.height ?? null,
    folderId: asset.folderId,
    deliveryPath: buildDeliveryPath(asset),
  };
}

function createdOutput(plan: NewFilePlan) {
  const { file } = plan;
  return {
    assetId: plan.id,
    status: "created",
    name: plan.name,
    mimetype: file.mimetype,
    size: file.bytes.byteLength,
    width: file.image.width ?? null,
    height: file.image.height ?? null,
    folderId: plan.folder._id,
    deliveryPath: `/media/${plan.id}/${encodeURIComponent(plan.name)}`,
  };
}

async function rememberKey(
  context: MediaRequestContext,
  plan: NewFilePlan,
  assetId: string,
): Promise<void> {
  if (!plan.key) return;
  const models = declaredModels(context.tenantId);
  if (plan.record)
    await models.declarationModel.update(plan.record._id, {
      targetId: assetId,
    });
  else
    await rememberDeclaration(
      models,
      "asset",
      automationKey(plan.key),
      assetId,
    );
}

async function applyOf(context: MediaRequestContext, plan: CreatePlan) {
  if (plan.kept) return keptOutput(plan.kept);
  const { asset, inserted } = await storeNewFile(
    {
      tenantId: context.tenantId,
      assetModel: context.assetModel,
      folder: plan.folder,
      name: plan.name,
      alt: plan.alt,
      createdBy: AUTOMATION_AUTHOR._id,
      id: plan.id,
    },
    plan.file,
  );
  if (!asset) throw new Error("the file could not be created");
  if (!inserted) return keptOutput(asset);
  await rememberKey(context, plan, asset._id);
  await recordAddedFile(context, asset, "automation", context.foldersById);
  return { ...keptOutput(asset), status: "created" };
}

const baseAction = writeAction({
  id: ACTION_ID,
  name: "Create file",
  description:
    "Creates a file in a media folder from text or base64 content produced by the procedure (a CSV export, a JSON report, a small image).",
  icon: "i-lucide-file-plus",
  inputSchema: objectSchema(
    {
      tenantId: TENANT_INPUT,
      folderId: FOLDER_ID_INPUT,
      binding: BINDING_INPUT,
      name: {
        type: "string",
        maxLength: 255,
        description: "File name with its extension",
      },
      content: {
        type: "string",
        description: `File content, at most ${MAX_CREATED_FILE_BYTES} bytes once decoded. Stored in the run as an input.`,
      },
      encoding: {
        type: "string",
        enum: ["utf8", "base64"],
        default: "utf8",
        description: "How `content` is written",
      },
      mimetype: {
        type: "string",
        maxLength: 100,
        description:
          "Must be a type the library and the folder's asset field accept",
      },
      alt: { type: "string", maxLength: 255, description: "Alt text" },
      onNameConflict: {
        type: "string",
        enum: ["rename", "fail"],
        default: "rename",
        description:
          "`rename` keeps both, numbering the new name; `fail` refuses a name the folder has",
      },
      key: {
        type: "string",
        maxLength: MAX_KEY_LENGTH,
        description:
          "Idempotency key: the same key again returns the file it created with status `kept` and writes nothing, unless that file was deleted",
      },
    },
    ["name", "content", "mimetype"],
  ),
  outputSchema: objectSchema({
    assetId: { type: "string", description: "New or kept file" },
    status: { type: "string", enum: ["created", "kept"] },
    name: { type: "string", description: "Final name, after a rename" },
    mimetype: { type: "string", description: "Stored mimetype" },
    size: { type: "number", description: "Bytes" },
    width: { type: ["number", "null"] },
    height: { type: ["number", "null"] },
    folderId: { type: "string" },
    deliveryPath: { type: "string" },
  }),
  input,
  plan: (context, value) => planOf(context, value),
  apply: (context, plan) => applyOf(context, plan),
  simulate: (plan) => (plan.kept ? keptOutput(plan.kept) : createdOutput(plan)),
  skipped: (plan) =>
    plan.kept
      ? `nothing: the key's file ${plan.kept._id} exists`
      : `creation of file "${plan.name}" in folder ${plan.folder._id}`,
});

/** Runs the calls of one key one after another, so a key used twice at once creates one file. */
async function serializedByKey<T>(
  value: JsonObject,
  run: () => Promise<T>,
): Promise<T> {
  const { tenantId, key } = parseInput(ACTION_ID, input, value);
  return key
    ? withDeclarationLock(tenantId, "asset", automationKey(key), run)
    : run();
}

export const createFileAction: typeof baseAction = {
  ...baseAction,
  execute: (value, ctx) =>
    serializedByKey(value, () => baseAction.execute(value, ctx)),
};
