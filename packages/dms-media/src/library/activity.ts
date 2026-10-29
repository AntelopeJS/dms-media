import type { ActivityFeedItem } from "@antelopejs/interface-dms/base/activity-feed";
import type { Tone } from "@antelopejs/interface-dms/base/types/tone";
import type { MediaEvent, MediaFolder } from "../db";
import { countParam } from "./composed-text";
import {
  BATCH_REPORT_KIND,
  batchIdOf,
  isMediaEventKind,
  latestBatchReports,
  type MediaEventDetails,
  type MediaEventKind,
  readEventDetails,
  UPLOAD_KIND,
} from "./events";
import { fileLink, folderLink, MEDIA_ROUTES } from "./links";

const TEXTS = "$dms_media.activity";
const VISIBILITY_KEY_PREFIX = "$dms_media.visibility.";
/** Same-kind writes of one person this close together read as one action. */
const GROUP_WINDOW_MS = 60 * 1000;
/** Details naming one file only: they never keep two writes apart. */
const PER_FILE_DETAILS: ReadonlySet<string> = new Set([
  "previous",
  "source",
  "batchId",
]);
/** Details kept out of the texts: data for other screens. */
const HIDDEN_DETAILS: ReadonlySet<string> = new Set(["failures", "targetId"]);
const GROUPABLE_KINDS: ReadonlySet<string> = new Set([
  "asset.upload",
  "asset.delete",
  "asset.move",
  "asset.alt",
  "asset.visibility",
  "asset.transform",
  "asset.revert",
]);
const UNLINKED_KINDS: ReadonlySet<string> = new Set([
  "asset.delete",
  "folder.delete",
]);
const TARGETED_KINDS: ReadonlySet<string> = new Set(["folder.create"]);
const VISIBILITY_KINDS: ReadonlySet<string> = new Set([
  "asset.visibility",
  "folder.visibility",
]);

interface EventPresentation {
  icon: string;
  tone: Tone;
}

const EVENT_PRESENTATIONS: Record<MediaEventKind, EventPresentation> = {
  "asset.upload": { icon: "i-ph-upload-simple", tone: "primary" },
  "upload.batch": { icon: "i-ph-cloud-arrow-up", tone: "primary" },
  "asset.delete": { icon: "i-ph-trash", tone: "error" },
  "asset.move": { icon: "i-ph-arrows-out-cardinal", tone: "neutral" },
  "asset.rename": { icon: "i-ph-pencil-simple", tone: "neutral" },
  "asset.alt": { icon: "i-ph-text-aa", tone: "neutral" },
  "asset.visibility": { icon: "i-ph-globe", tone: "success" },
  "asset.transform": { icon: "i-ph-crop", tone: "neutral" },
  "asset.revert": { icon: "i-ph-arrow-counter-clockwise", tone: "warning" },
  "folder.create": { icon: "i-ph-folder-plus", tone: "primary" },
  "folder.delete": { icon: "i-ph-trash", tone: "error" },
  "folder.rename": { icon: "i-ph-pencil-simple", tone: "neutral" },
  "folder.move": { icon: "i-ph-arrows-out-cardinal", tone: "neutral" },
  "folder.visibility": { icon: "i-ph-globe", tone: "success" },
};

const NEUTRAL_PRESENTATION: EventPresentation = {
  icon: "i-ph-clock-counter-clockwise",
  tone: "neutral",
};

type BatchOutcome = "partial" | "failed";

const BATCH_PRESENTATIONS: Record<BatchOutcome, EventPresentation> = {
  partial: { icon: "i-ph-cloud-warning", tone: "warning" },
  failed: { icon: "i-ph-cloud-x", tone: "error" },
};

/** The kinds of entries the activity page can be narrowed to. */
export const ACTIVITY_FILTERS = {
  uploads: ["asset.upload", "upload.batch"],
  edits: ["asset.rename", "asset.alt", "asset.transform", "asset.revert"],
  moves: ["asset.move", "folder.move"],
  deletions: ["asset.delete", "folder.delete"],
  visibility: ["asset.visibility", "folder.visibility"],
  folders: [
    "folder.create",
    "folder.rename",
    "folder.move",
    "folder.delete",
    "folder.visibility",
  ],
} as const satisfies Record<string, readonly MediaEventKind[]>;

export type ActivityFilter = keyof typeof ACTIVITY_FILTERS;

export function isActivityFilter(value: unknown): value is ActivityFilter {
  return typeof value === "string" && Object.hasOwn(ACTIVITY_FILTERS, value);
}

export interface ActivitySource {
  events: MediaEvent[];
  foldersById: Map<string, MediaFolder>;
  /** Keeps only the entries of these kinds; every kind without it. */
  filter?: ActivityFilter;
  /** Folds a bulk action into one entry; off for the history of one file. */
  foldsBulkActions?: boolean;
}

interface ActivityEntry {
  event: MediaEvent;
  count: number;
  oldestAt: Date;
}

interface ActivityContext extends ActivitySource {
  deletedAssetIds: Set<string>;
}

export function folderPath(
  folderId: string | undefined,
  foldersById: Map<string, MediaFolder>,
): string {
  if (!folderId) return "";
  const folder = foldersById.get(folderId);
  if (!folder) return "";
  return [...folder.path, folder._id]
    .map((id) => foldersById.get(id)?.name)
    .filter((name): name is string => Boolean(name))
    .join(" › ");
}

/** The folder an entry is about: the created folder itself, or where it happened. */
function subjectFolderId(event: MediaEvent): string | undefined {
  if (!TARGETED_KINDS.has(event.kind)) return event.folderId;
  const target = readEventDetails(event).targetId;
  return target === undefined ? event.folderId : String(target);
}

function eventLink(
  entry: ActivityEntry,
  context: ActivityContext,
): string | undefined {
  const { event } = entry;
  if (UNLINKED_KINDS.has(event.kind)) return undefined;
  const folderId = subjectFolderId(event);
  if (folderId && !context.foldersById.has(folderId)) return undefined;
  if (entry.count > 1) return folderId ? folderLink(folderId) : undefined;
  if (event.assetId) {
    return context.deletedAssetIds.has(event.assetId)
      ? undefined
      : fileLink(event.assetId);
  }
  return folderId ? folderLink(folderId) : MEDIA_ROUTES.files;
}

function visibleDetails(details: MediaEventDetails): MediaEventDetails {
  return Object.fromEntries(
    Object.entries(details).filter(([key]) => !HIDDEN_DETAILS.has(key)),
  );
}

/** The parameters of a feed item's title and meta texts. */
type FeedParams = NonNullable<ActivityFeedItem["params"]>;

function toParams(entry: ActivityEntry): FeedParams {
  const details = visibleDetails(readEventDetails(entry.event));
  const params: FeedParams = {
    actor: entry.event.actorName,
    name: entry.event.targetName,
    count: countParam(entry.count),
  };
  for (const [key, value] of Object.entries(details))
    params[key] = String(value);
  return params;
}

function batchOutcome(event: MediaEvent): BatchOutcome {
  return (event.count ?? 0) === 0 ? "failed" : "partial";
}

function titleSuffix(event: MediaEvent): string {
  if (event.kind === BATCH_REPORT_KIND) return `_${batchOutcome(event)}`;
  if (!VISIBILITY_KINDS.has(event.kind)) return "";
  const visibility = String(readEventDetails(event).visibility ?? "");
  return `_${visibility.replace(VISIBILITY_KEY_PREFIX, "")}`;
}

function batchParams(event: MediaEvent): FeedParams {
  const details = readEventDetails(event);
  return {
    uploaded: countParam(event.count ?? 0),
    failed: countParam(Number(details.failed ?? 0)),
    total: Number(details.total ?? 0),
  };
}

function presentEntry(
  entry: ActivityEntry,
  context: ActivityContext,
): ActivityFeedItem {
  const { event } = entry;
  const { kind } = event;
  const known = isMediaEventKind(kind) ? kind : undefined;
  const isReport = kind === BATCH_REPORT_KIND;
  const presentation = isReport
    ? BATCH_PRESENTATIONS[batchOutcome(event)]
    : ((known && EVENT_PRESENTATIONS[known]) ?? NEUTRAL_PRESENTATION);
  const path = folderPath(subjectFolderId(event), context.foldersById);
  const isGone = Boolean(
    event.assetId && context.deletedAssetIds.has(event.assetId),
  );
  return {
    id: event._id,
    icon: presentation.icon,
    tone: presentation.tone,
    title: `${TEXTS}.${kind.replace(".", "_")}${titleSuffix(event)}`,
    params: isReport
      ? { ...toParams(entry), ...batchParams(event) }
      : toParams(entry),
    meta: [
      ...(path ? [path] : []),
      ...(isGone && entry.count === 1 && !UNLINKED_KINDS.has(kind)
        ? [`${TEXTS}.deleted_marker`]
        : []),
    ],
    date: event.createdAt.toISOString(),
    to: eventLink(entry, context),
  };
}

function groupSignature(event: MediaEvent): string {
  const details = Object.entries(readEventDetails(event))
    .filter(([key]) => !PER_FILE_DETAILS.has(key))
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify([event.kind, event.actorId, event.folderId, details]);
}

function joinsGroup(group: ActivityEntry, event: MediaEvent): boolean {
  if (!GROUPABLE_KINDS.has(event.kind)) return false;
  if (groupSignature(group.event) !== groupSignature(event)) return false;
  const gap = group.oldestAt.getTime() - event.createdAt.getTime();
  return gap <= GROUP_WINDOW_MS;
}

function newEntry(event: MediaEvent): ActivityEntry {
  return { event, count: 1, oldestAt: event.createdAt };
}

/**
 * One entry per upload batch: the files folded together, unless the batch
 * failed in part or whole, then its newest report says so in their place.
 */
function foldUploads(events: MediaEvent[]): MediaEvent[] {
  const reports = latestBatchReports(events);
  const failedBatches = new Set(
    [...reports]
      .filter(([, report]) => Number(readEventDetails(report).failed ?? 0) > 0)
      .map(([batchId]) => batchId),
  );
  const keptReports = new Set(
    [...failedBatches].map((batchId) => reports.get(batchId)),
  );
  return events.filter((event) => {
    if (event.kind === BATCH_REPORT_KIND) return keptReports.has(event);
    if (event.kind !== UPLOAD_KIND) return true;
    const batchId = batchIdOf(event);
    return !batchId || !failedBatches.has(batchId);
  });
}

function foldUploadGroups(events: MediaEvent[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  const groups = new Map<string, ActivityEntry>();
  for (const event of events) {
    const batchId = event.kind === UPLOAD_KIND ? batchIdOf(event) : undefined;
    const group = batchId ? groups.get(batchId) : undefined;
    if (group) {
      group.count += 1;
      continue;
    }
    const entry = newEntry(event);
    if (batchId) groups.set(batchId, entry);
    entries.push(entry);
  }
  return entries;
}

/** Same-kind writes of one person in a row, a bulk move for one, fold into one entry. */
function foldBulkActions(entries: ActivityEntry[]): ActivityEntry[] {
  const folded: ActivityEntry[] = [];
  for (const entry of entries) {
    const last = folded.at(-1);
    if (last && entry.count === 1 && joinsGroup(last, entry.event)) {
      last.count += 1;
      last.oldestAt = entry.event.createdAt;
    } else folded.push({ ...entry });
  }
  return folded;
}

function deletedAssets(events: MediaEvent[]): Set<string> {
  return new Set(
    events.flatMap((event) =>
      event.kind === "asset.delete" && event.assetId ? [event.assetId] : [],
    ),
  );
}

/** Newest first, with one entry per upload batch and per bulk action. */
export function buildActivityItems(
  source: ActivitySource,
  limit: number,
): ActivityFeedItem[] {
  const context: ActivityContext = {
    ...source,
    deletedAssetIds: deletedAssets(source.events),
  };
  const kinds: ReadonlySet<string> | undefined = source.filter
    ? new Set(ACTIVITY_FILTERS[source.filter])
    : undefined;
  const events = kinds
    ? source.events.filter((event) => kinds.has(event.kind))
    : source.events;
  const entries = foldUploadGroups(foldUploads(events));
  return (
    source.foldsBulkActions === false ? entries : foldBulkActions(entries)
  )
    .slice(0, limit)
    .map((entry) => presentEntry(entry, context));
}
