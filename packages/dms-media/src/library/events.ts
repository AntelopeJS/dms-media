import { GetModel } from "@antelopejs/interface-database-decorators";
import { Logging } from "@antelopejs/interface-core/logging";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { currentAutomationOrigin } from "../automation/origin";
import {
  type MediaAsset,
  type MediaEvent,
  MediaEventModel,
  type MediaFolder,
} from "../db";
import type { FolderVisibility } from "../types";
import { z } from "zod";
import { announceLibraryChange, UPLOAD_ANNOUNCE_WINDOW_MS } from "./realtime";

export const MEDIA_EVENT_KINDS = [
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

export type MediaEventDetails = Record<string, string | number>;

const eventDetailsSchema: z.ZodType<MediaEventDetails> = z.record(
  z.string(),
  z.union([z.string(), z.number()]),
);

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

/** How a new file reached the library. */
export type MediaFileSource = "upload" | "copy" | "declared" | "automation";

/**
 * What a write knows besides its activity entry, for the automation triggers
 * the entry feeds: the rows it changed as they are now (or a loader, run only
 * when a trigger needs them) and the folders it saw.
 */
export interface MediaEventFacts {
  assets?: MediaAsset[];
  /** Reads the changed rows, for a write that did not load them. */
  loadAssets?: () => Promise<MediaAsset[]>;
  foldersById?: ReadonlyMap<string, MediaFolder>;
  source?: MediaFileSource;
  copiedFromAssetId?: string;
  /** Effective visibility of a file before the write, for a visibility change. */
  previousEffective?: (asset: MediaAsset) => FolderVisibility;
  /** The folder whose deletion removed the files. */
  deletedFolder?: MediaFolder;
}

/** An activity entry as recorded, with what the write knew besides it. */
export interface RecordedMediaEvent {
  actor: MediaEventActor;
  input: MediaEventInput;
  eventId?: string;
  facts: MediaEventFacts;
  at: Date;
}

type MediaEventObserver = (event: RecordedMediaEvent) => Promise<void>;

let observer: MediaEventObserver | undefined;

/** Hands every recorded entry to `next`, or to nobody when it is undefined. */
export function observeMediaEvents(next: MediaEventObserver | undefined): void {
  observer = next;
}

/** Uploads arrive in bursts: they are announced on a longer window than other writes. */
const ANNOUNCE_DELAYS: Partial<Record<MediaEventKind, number>> = {
  "asset.upload": UPLOAD_ANNOUNCE_WINDOW_MS,
};

export const UPLOAD_KIND: MediaEventKind = "asset.upload";
export const BATCH_REPORT_KIND: MediaEventKind = "upload.batch";

/** The entry's details, with the procedure step that made the write when one did. */
function detailsWithOrigin(
  details: MediaEventDetails | undefined,
): MediaEventDetails | undefined {
  const origin = currentAutomationOrigin();
  if (!origin) return details;
  return { ...details, procedureId: origin.procedureId, runId: origin.runId };
}

/**
 * Records an activity entry and hands it to the automation triggers; a
 * failure of either is logged and never fails the write. Resolves with the
 * entry's id, or `undefined` when the insert failed.
 */
export async function recordMediaEvent(
  actor: MediaEventActor,
  input: MediaEventInput,
  facts: MediaEventFacts = {},
): Promise<string | undefined> {
  const details = detailsWithOrigin(input.details);
  let eventId: string | undefined;
  try {
    [eventId] = await GetModel(MediaEventModel, actor.tenantId).insert({
      kind: input.kind,
      actorId: actor.user._id,
      actorName: actor.user.name || actor.user.email,
      folderId: input.folderId,
      assetId: input.assetId,
      targetName: input.targetName,
      count: input.count,
      size: input.size,
      json_details: details ? JSON.stringify(details) : undefined,
    });
  } catch (error) {
    Logging.Error("Failed to record a media event", error);
  }
  announceLibraryChange(ANNOUNCE_DELAYS[input.kind]);
  await observer?.({
    actor,
    input: { ...input, details },
    eventId,
    facts,
    at: new Date(),
  });
  return eventId;
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
