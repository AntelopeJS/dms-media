import type { ActivityFeedItem } from "@antelopejs/interface-dms/base/activity-feed";
import type { Tone } from "@antelopejs/interface-dms/base/types/tone";
import type { MediaEvent, MediaFolder } from "../db";
import { type MediaEventKind, readEventDetails } from "./events";
import { fileLink, folderLink, MEDIA_ROUTES } from "./links";

const TEXTS = "$dms_media.activity";
const UPLOAD_KIND: MediaEventKind = "asset.upload";

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
  "folder.acl": { icon: "i-ph-shield-check", tone: "warning" },
};

const NEUTRAL_PRESENTATION: EventPresentation = {
  icon: "i-ph-clock-counter-clockwise",
  tone: "neutral",
};

export interface ActivitySource {
  events: MediaEvent[];
  foldersById: Map<string, MediaFolder>;
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

function eventLink(event: MediaEvent): string | undefined {
  if (event.kind === "asset.delete" || event.kind === "folder.delete")
    return undefined;
  if (event.assetId) return fileLink(event.assetId);
  if (event.folderId) return folderLink(event.folderId);
  return MEDIA_ROUTES.files;
}

function toParams(event: MediaEvent, count: number): Record<string, string> {
  const details = readEventDetails(event);
  const params: Record<string, string> = {
    actor: event.actorName,
    name: event.targetName,
    count: String(count),
  };
  for (const [key, value] of Object.entries(details))
    params[key] = String(value);
  return params;
}

function presentEvent(
  event: MediaEvent,
  count: number,
  source: ActivitySource,
): ActivityFeedItem {
  const kind = event.kind as MediaEventKind;
  const presentation = EVENT_PRESENTATIONS[kind] ?? NEUTRAL_PRESENTATION;
  const path = folderPath(event.folderId, source.foldersById);
  return {
    id: event._id,
    icon: presentation.icon,
    tone: presentation.tone,
    title: `${TEXTS}.${kind.replace(".", "_")}${count > 1 ? "_many" : ""}`,
    params: toParams(event, count),
    meta: path ? [path] : [],
    date: event.createdAt.toISOString(),
    to: count > 1 ? folderLink(event.folderId ?? "") : eventLink(event),
  };
}

function uploadGroupKey(event: MediaEvent): string {
  const batchId = readEventDetails(event).batchId;
  return batchId ? `batch:${batchId}` : `event:${event._id}`;
}

/** Newest first, with the files of one upload batch folded into one entry. */
export function buildActivityItems(
  source: ActivitySource,
  limit: number,
): ActivityFeedItem[] {
  const items: ActivityFeedItem[] = [];
  const uploadGroups = new Map<string, { event: MediaEvent; count: number }>();
  const order: Array<MediaEvent | string> = [];
  for (const event of source.events) {
    if (event.kind !== UPLOAD_KIND) {
      order.push(event);
      continue;
    }
    const key = uploadGroupKey(event);
    const group = uploadGroups.get(key);
    if (group) group.count += 1;
    else {
      uploadGroups.set(key, { event, count: 1 });
      order.push(key);
    }
  }
  for (const entry of order) {
    if (items.length === limit) break;
    if (typeof entry !== "string") {
      items.push(presentEvent(entry, 1, source));
      continue;
    }
    const group = uploadGroups.get(entry);
    if (group) items.push(presentEvent(group.event, group.count, source));
  }
  return items;
}
