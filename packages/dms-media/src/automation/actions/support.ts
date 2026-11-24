import { HTTPResult } from "@antelopejs/interface-api";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import type {
  ActionType,
  ExecutionCtx,
  JsonObject,
  JsonSchema,
} from "@antelopejs/interface-dms-automation";
import { type ZodType, z } from "zod";
import { bindingFolderId } from "../../bindings";
import type { MediaAsset, MediaFolder } from "../../db";
import { AUTOMATION_AUTHOR } from "../../declared/records";
import type { MediaRequestContext } from "../../routes/media/context";
import { resolveSystemContext } from "../../services/context";
import { requireReadableAsset } from "../../services/files";
import { MEDIA_ERRORS } from "../../validation/media.schema";
import { runAsAutomation } from "../origin";

const MAX_TENANT_ID_LENGTH = 255;
const MAX_ID_LENGTH = 64;
const MAX_BINDING_LENGTH = 255;

/** The dashboard's i18n keys a service fails with, as a run shows them. */
const READABLE_ERRORS = new Map<string, string>([
  [MEDIA_ERRORS.invalidRequest, "invalid request"],
  [MEDIA_ERRORS.assetNotFound, "file not found"],
  [MEDIA_ERRORS.nameRequired, "a name is required"],
  [MEDIA_ERRORS.nameTooLong, "the name is limited to 255 characters"],
  [
    MEDIA_ERRORS.nameForbidden,
    "a name can't contain / \\ < > : \" | ? * or control characters",
  ],
  [MEDIA_ERRORS.nameTaken, "another file of the folder has this name"],
  [MEDIA_ERRORS.folderNameTaken, "another folder there has this name"],
  [MEDIA_ERRORS.boundParent, "this linked folder cannot hold subfolders"],
  [
    MEDIA_ERRORS.fieldType,
    "the folder feeds an asset field that does not accept this type",
  ],
  [MEDIA_ERRORS.altTooLong, "the alt text is limited to 255 characters"],
]);

/** A message as a run shows it: English rather than an i18n key. */
function readableError(message: string): string {
  return READABLE_ERRORS.get(message) ?? message;
}

export const TENANT_INPUT: JsonSchema = {
  type: "string",
  maxLength: MAX_TENANT_ID_LENGTH,
  description: "Tenant id; empty uses the default tenant",
};

export const ASSET_ID_INPUT: JsonSchema = {
  type: "string",
  maxLength: MAX_ID_LENGTH,
  description: "File id",
};

export const FOLDER_ID_INPUT: JsonSchema = {
  type: "string",
  maxLength: MAX_ID_LENGTH,
  description: "Folder id. Give this or `binding`.",
};

export const BINDING_INPUT: JsonSchema = {
  type: "string",
  maxLength: MAX_BINDING_LENGTH,
  description:
    "Asset field whose linked folder to use. Give this or `folderId`.",
};

/** The `tenantId` every media action takes: empty means the default tenant. */
export const tenantIdField = z
  .string()
  .trim()
  .max(MAX_TENANT_ID_LENGTH)
  .optional()
  .transform((value) => value || DEFAULT_TENANT_ID);

export const assetIdField = z.string().trim().min(1).max(MAX_ID_LENGTH);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

/** A folder named by id or by the asset field it is linked to. */
export const folderTargetFields = {
  folderId: optionalText(MAX_ID_LENGTH),
  binding: optionalText(MAX_BINDING_LENGTH),
};

export interface FolderTarget {
  folderId?: string;
  binding?: string;
}

/** Refuses a folder target naming both or neither of `folderId` and `binding`. */
export function oneFolderTarget(target: FolderTarget): boolean {
  return (target.folderId === undefined) !== (target.binding === undefined);
}

export const ONE_FOLDER_TARGET = {
  message: "give exactly one of folderId and binding",
};

/**
 * Checks an action's input with `schema`, failing the step with the action id
 * and each refused field before anything is read or written.
 */
export function parseInput<T>(
  actionId: string,
  schema: ZodType<T, unknown>,
  value: JsonObject,
): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues
    .map(
      (issue) =>
        `${issue.path.join(".") || "input"}: ${readableError(issue.message)}`,
    )
    .join("; ");
  throw new Error(`${actionId}: invalid input (${issues})`);
}

/**
 * Runs an action body so that what it throws fails the step with a readable
 * message prefixed by the action id: an `HTTPResult` from a shared service
 * would otherwise show as an object.
 */
async function asStep<T>(actionId: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HTTPResult)
      throw new Error(`${actionId}: ${readableError(error.getBody())}`);
    if (error instanceof Error && !error.message.startsWith(`${actionId}:`))
      throw new Error(`${actionId}: ${readableError(error.message)}`, {
        cause: error,
      });
    throw error;
  }
}

/** The context a procedure acts through: every right, attributed to `Automation`. */
function automationContext(tenantId: string): Promise<MediaRequestContext> {
  return resolveSystemContext(tenantId, AUTOMATION_AUTHOR);
}

/** The folder a target names, or the step fails. */
export function requireTargetFolder(
  context: MediaRequestContext,
  target: FolderTarget,
): MediaFolder {
  const folderId = target.binding
    ? bindingFolderId(context.tenantId, target.binding)
    : (target.folderId ?? "");
  const folder = context.foldersById.get(folderId);
  if (!folder) throw new Error("Folder not found");
  return folder;
}

/** The live file `assetId` names in the context's tenant, or the step fails. */
export async function requireFile(
  context: MediaRequestContext,
  assetId: string,
): Promise<MediaAsset> {
  try {
    return await requireReadableAsset(context, assetId);
  } catch {
    throw new Error(`File ${assetId} not found in tenant ${context.tenantId}`);
  }
}

/** The texts and port schemas of an action. */
export interface ActionSpec {
  id: string;
  name: string;
  description: string;
  icon: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

/** A write split into checks and effects, so a test run runs the checks only. */
export interface WriteSpec<
  TInput extends { tenantId: string },
  TPlan,
  TOutput,
> extends ActionSpec {
  input: ZodType<TInput, unknown>;
  /** Every read and check, no write. */
  plan(context: MediaRequestContext, input: TInput): Promise<TPlan>;
  /** The writes and the activity entry. */
  apply(context: MediaRequestContext, plan: TPlan): Promise<TOutput>;
  /** What `apply` would return, with simulated ids where it would create a row. */
  simulate(plan: TPlan): TOutput;
  /** What a test run skipped, for its log. */
  skipped(plan: TPlan): string;
}

/** An object port schema with these properties. */
export function objectSchema(
  properties: Record<string, JsonSchema>,
  required: string[] = [],
): JsonSchema {
  return { type: "object", properties, required };
}

/**
 * A write action: it acts through the automation context of its tenant, and
 * its writes carry the procedure step, so the triggers they feed can tell a
 * procedure's change from a member's.
 */
export function writeAction<
  TInput extends { tenantId: string },
  TPlan,
  TOutput extends JsonObject,
>(spec: WriteSpec<TInput, TPlan, TOutput>): ActionType<JsonObject, TOutput> {
  const prepare = async (value: JsonObject) => {
    const input = parseInput(spec.id, spec.input, value);
    const context = await automationContext(input.tenantId);
    return { context, plan: await spec.plan(context, input) };
  };
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    icon: spec.icon,
    inputSchema: spec.inputSchema,
    outputSchema: spec.outputSchema,
    execute(value, ctx: ExecutionCtx) {
      return asStep(spec.id, () =>
        runAsAutomation(ctx, async () => {
          const { context, plan } = await prepare(value);
          return spec.apply(context, plan);
        }),
      );
    },
    dryRun(value, ctx: ExecutionCtx) {
      return asStep(spec.id, async () => {
        const { plan } = await prepare(value);
        ctx.log("info", `Simulated (test run): ${spec.skipped(plan)}`);
        return spec.simulate(plan);
      });
    },
  };
}

/** A read action: no effect, so a test run runs it for real. */
export function readAction<
  TInput extends { tenantId: string },
  TOutput extends JsonObject,
>(
  spec: ActionSpec & {
    input: ZodType<TInput, unknown>;
    read(context: MediaRequestContext, input: TInput): Promise<TOutput>;
  },
): ActionType<JsonObject, TOutput> {
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    icon: spec.icon,
    inputSchema: spec.inputSchema,
    outputSchema: spec.outputSchema,
    sideEffects: false,
    execute(value) {
      return asStep(spec.id, async () => {
        const input = parseInput(spec.id, spec.input, value);
        return spec.read(await automationContext(input.tenantId), input);
      });
    },
  };
}
