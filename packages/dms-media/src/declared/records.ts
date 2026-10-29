import { GetModel } from "@antelopejs/interface-database-decorators";
import type { ZodType, ZodTypeDef } from "zod";
import { isObjectLike, isString } from "../guards";
import {
  MediaAssetModel,
  type MediaDeclarationKind,
  MediaDeclarationModel,
  MediaFolderModel,
} from "../db";
import type { MediaEventAuthor } from "../library/events";
import { describeDeclarationIssues } from "../validation/declared.schema";

/** Declared content is attributed to the system, not to a member. */
export const DECLARED_CONTENT_AUTHOR: MediaEventAuthor = {
  _id: "dms-media:declared",
  name: "System",
  email: "",
};

const KIND_LABELS: Record<MediaDeclarationKind, string> = {
  folder: "Media folder",
  asset: "Media file",
};

/** A declaration the media module refuses, named by its kind and key. */
export class MediaDeclarationError extends Error {
  constructor(kind: MediaDeclarationKind, key: string, reason: string) {
    super(`${KIND_LABELS[kind]} '${key}': ${reason}`);
  }
}

export interface DeclaredModels {
  tenantId: string;
  folderModel: MediaFolderModel;
  assetModel: MediaAssetModel;
  declarationModel: MediaDeclarationModel;
}

export function declaredModels(tenantId: string): DeclaredModels {
  return {
    tenantId,
    folderModel: GetModel(MediaFolderModel, tenantId),
    assetModel: GetModel(MediaAssetModel, tenantId),
    declarationModel: GetModel(MediaDeclarationModel, tenantId),
  };
}

/** Validates a declaration, naming every refused field. */
export function parseDeclaration<Output>(
  kind: MediaDeclarationKind,
  input: unknown,
  schema: ZodType<Output, ZodTypeDef, unknown>,
): Output {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const key = isObjectLike(input) && "key" in input ? input.key : undefined;
  throw new MediaDeclarationError(
    kind,
    isString(key) ? key : "?",
    describeDeclarationIssues(parsed.error),
  );
}

const pendingDeclarations = new Map<string, Promise<unknown>>();

function lockKey(
  tenantId: string,
  kind: MediaDeclarationKind,
  key: string,
): string {
  return JSON.stringify([tenantId, kind, key]);
}

/**
 * Runs the declarations of one key one after another, so a key declared twice
 * at once (a retried provisioning racing the first) still creates a single row.
 */
export function withDeclarationLock<T>(
  tenantId: string,
  kind: MediaDeclarationKind,
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const id = lockKey(tenantId, kind, key);
  const previous = pendingDeclarations.get(id) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  const settled = next.catch(() => undefined);
  pendingDeclarations.set(id, settled);
  void settled.then(() => {
    if (pendingDeclarations.get(id) === settled) pendingDeclarations.delete(id);
  });
  return next;
}

/** Waits for a declaration of `key` still running, such as a parent folder declared alongside. */
export async function settlePendingDeclaration(
  tenantId: string,
  kind: MediaDeclarationKind,
  key: string,
): Promise<void> {
  await pendingDeclarations.get(lockKey(tenantId, kind, key));
}

/** Remembers the folder or file a declaration created, under its kind and key. */
export async function rememberDeclaration(
  models: DeclaredModels,
  kind: MediaDeclarationKind,
  key: string,
  targetId: string,
): Promise<void> {
  await models.declarationModel.insert({ kind, key, targetId });
}
