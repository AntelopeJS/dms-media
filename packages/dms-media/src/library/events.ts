import { GetModel } from "@antelopejs/interface-database-decorators";
import { Logging } from "@antelopejs/interface-core/logging";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { type MediaEvent, MediaEventModel } from "../db";
import { z } from "zod";
import { announceLibraryChange, UPLOAD_ANNOUNCE_WINDOW_MS } from "./realtime";

const MEDIA_EVENT_KINDS = [
  "asset.upload",
  "upload.batch",
  "asset.delete",
  "asset.move",
  "asset.rename",
  "asset.alt",
  "asset.visibility",
  "asset.transform",
  "asset.revert",
  "folder.create",
  "folder.delete",
  "folder.rename",
  "folder.move",
  "folder.visibility",
] as const;

export type MediaEventKind = (typeof MEDIA_EVENT_KINDS)[number];

const eventDetailsSchema = z.record(z.union([z.string(), z.number()]));

export type MediaEventDetails = z.infer<typeof eventDetailsSchema>;

export interface MediaEventInput {
  kind: MediaEventKind;
  targetName: string;
  folderId?: string;
  assetId?: string;
  count?: number;
  size?: number;
  details?: MediaEventDetails;
}

/** Who an event is attributed to: a member, or the system for declared content. */
export type MediaEventAuthor = Pick<User, "_id" | "name" | "email">;

export interface MediaEventActor {
  tenantId: string;
  user: MediaEventAuthor;
}

/** Uploads arrive in bursts: they are announced on a longer window than other writes. */
const ANNOUNCE_DELAYS: Partial<Record<MediaEventKind, number>> = {
  "asset.upload": UPLOAD_ANNOUNCE_WINDOW_MS,
};

export const UPLOAD_KIND: MediaEventKind = "asset.upload";
export const BATCH_REPORT_KIND: MediaEventKind = "upload.batch";

/** Records an activity entry; a failure is logged and never fails the write. */
export async function recordMediaEvent(
  actor: MediaEventActor,
  input: MediaEventInput,
): Promise<void> {
  try {
    await GetModel(MediaEventModel, actor.tenantId).insert({
      kind: input.kind,
      actorId: actor.user._id,
      actorName: actor.user.name || actor.user.email,
      folderId: input.folderId,
      assetId: input.assetId,
      targetName: input.targetName,
      count: input.count,
      size: input.size,
      json_details: input.details ? JSON.stringify(input.details) : undefined,
    });
  } catch (error) {
    Logging.Error("Failed to record a media event", error);
  }
  announceLibraryChange(ANNOUNCE_DELAYS[input.kind]);
}

export function readEventDetails(event: MediaEvent): MediaEventDetails {
  if (!event.json_details) return {};
  try {
    const parsed = eventDetailsSchema.safeParse(JSON.parse(event.json_details));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/** The upload batch an event belongs to, when it was part of one. */
export function batchIdOf(event: MediaEvent): string | undefined {
  const batchId = readEventDetails(event).batchId;
  return batchId === undefined ? undefined : String(batchId);
}

/**
 * The newest report of each batch, by batch id. A retried batch is reported
 * again: its last report replaces the earlier ones. Expects newest first.
 */
export function latestBatchReports(
  events: MediaEvent[],
): Map<string, MediaEvent> {
  const reports = new Map<string, MediaEvent>();
  for (const event of events) {
    if (event.kind !== BATCH_REPORT_KIND) continue;
    const key = batchIdOf(event) ?? event._id;
    if (!reports.has(key)) reports.set(key, event);
  }
  return reports;
}

/** Events recorded since a date, newest first, whatever else happened since. */
export async function listEventsSince(
  tenantId: string,
  since: Date,
): Promise<MediaEvent[]> {
  const rows = await GetModel(MediaEventModel, tenantId)
    .table.filter((row) => row.key("createdAt").ge(since))
    .run();
  return rows
    .map((row) => MediaEventModel.fromDatabase(row))
    .filter((row): row is MediaEvent => row !== undefined)
    .sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );
}
