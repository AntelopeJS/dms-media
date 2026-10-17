import { createHash } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type { MediaDeclarationResult } from "@antelopejs/interface-dms-media";
import type { ZodError, ZodType } from "zod";
import {
  MediaAssetModel,
  type MediaDeclaration,
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

/** Values a declaration compares, built with a fixed key order so equal values hash equally. */
export type HashedState = Record<string, unknown>;

export function hashState(state: HashedState): string {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Validates a declaration, naming every refused field. */
export function parseDeclaration<Schema extends ZodType>(
  kind: MediaDeclarationKind,
  input: unknown,
  schema: Schema,
): ReturnType<Schema["parse"]> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data as ReturnType<Schema["parse"]>;
  const key = (input as { key?: unknown } | undefined)?.key;
  throw new MediaDeclarationError(
    kind,
    typeof key === "string" ? key : "?",
    describeDeclarationIssues(parsed.error as ZodError),
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
 * at once (a boot racing a hot reload) still creates a single row.
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

export interface AppliedDeclaration {
  kind: MediaDeclarationKind;
  key: string;
  targetId: string;
  declaredHash: string;
  appliedHash: string;
  contentHash?: string;
  version?: string;
}

/** Remembers what was declared and the state it left the row in. */
export async function saveDeclaration(
  model: MediaDeclarationModel,
  existing: MediaDeclaration | undefined,
  applied: AppliedDeclaration,
): Promise<void> {
  if (existing) {
    await model.update(existing._id, applied);
    return;
  }
  await model.insert(applied);
}

interface DeletedByMember {
  status: "deleted";
}

interface ChangedByMember {
  status: "preserved";
  id: string;
}

/** What a member did to declared content: deleted it, or changed it and so keeps it. */
export type MemberChange = DeletedByMember | ChangedByMember;

/**
 * The part of the rule that needs no new declaration: a row deleted since it
 * was declared stays deleted, and a row whose editable state no longer hashes
 * to what the last declaration left was changed by a member and stays as they
 * made it. Returns undefined when the row is still as declared.
 */
export function judgeMemberChange(
  record: MediaDeclaration,
  row: { _id: string } | undefined,
  stateHash: string | undefined,
): MemberChange | undefined {
  if (!row) return { status: "deleted" };
  if (stateHash !== record.appliedHash)
    return { status: "preserved", id: row._id };
  return undefined;
}

/**
 * The rule shared by folders and files: `judgeMemberChange`, then a
 * declaration equal to the last one leaves the row unchanged. Returns
 * undefined when the row may be refreshed.
 */
export function judgeDeclaredRow(
  record: MediaDeclaration,
  row: { _id: string } | undefined,
  stateHash: string | undefined,
  declaredHash: string,
): MediaDeclarationResult | undefined {
  const change = judgeMemberChange(record, row, stateHash);
  if (change || !row) return change;
  if (record.declaredHash === declaredHash)
    return { status: "unchanged", id: row._id };
  return undefined;
}
