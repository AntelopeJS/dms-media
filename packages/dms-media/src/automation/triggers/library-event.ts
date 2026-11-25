import { randomUUID } from "node:crypto";
import {
  MEDIA_EVENT_KINDS,
  type MediaEventDetails,
  type MediaEventKind,
} from "../../library/events";
import {
  channelTrigger,
  TriggerChannel,
  type TriggerSettings,
} from "../channel";
import {
  type ActorKind,
  type CommonFields,
  commonFields,
  type FolderLookup,
  type RecordedMediaEvent,
} from "../recorded";
import {
  acceptsFolder,
  FOLDER_CONFIG,
  type FolderSettings,
  isChosen,
} from "./filters";

type MemberActor = Exclude<ActorKind, "automation">;

export interface LibraryEventConfig extends TriggerSettings, FolderSettings {
  kinds?: MediaEventKind[];
  actors?: MemberActor[];
}

export type LibraryEventPayload = CommonFields & {
  eventId: string | null;
  kind: MediaEventKind;
  targetName: string;
  assetId: string | null;
  folderId: string | null;
  targetFolderId: string | null;
  count: number | null;
  size: number | null;
  details: MediaEventDetails;
};

const DEFAULT_ACTORS: readonly MemberActor[] = ["member"];
const VISIBILITY_KEY_PREFIX = "$dms_media.visibility.";
const TARGETS_ITSELF = new Set<MediaEventKind>([
  "folder.rename",
  "folder.move",
  "folder.visibility",
]);

export const libraryEventChannel = new TriggerChannel<
  LibraryEventConfig,
  LibraryEventPayload
>(
  "media.library-event",
  (config, event) =>
    isChosen(config.kinds, MEDIA_EVENT_KINDS, event.payload.kind) &&
    acceptsFolder(config, event) &&
    (event.payload.actorKind === "automation" ||
      isChosen(config.actors, DEFAULT_ACTORS, event.payload.actorKind)),
);

export const libraryEventTrigger = channelTrigger(libraryEventChannel, {
  name: "Library activity",
  description:
    "Fires for each entry of the media library's activity log: uploads, renames, moves, visibility changes, edits, deletions, folder changes.",
  icon: "i-lucide-activity",
  configProperties: {
    kinds: {
      type: "array",
      minItems: 1,
      items: { type: "string", enum: [...MEDIA_EVENT_KINDS] },
      default: [...MEDIA_EVENT_KINDS],
      description: "Kinds of entry that fire.",
    },
    ...FOLDER_CONFIG,
    actors: {
      type: "array",
      minItems: 1,
      items: { type: "string", enum: ["member", "declared"] },
      default: [...DEFAULT_ACTORS],
      description:
        "Who made the change: a member, or a module's declared content.",
    },
  },
  outputProperties: {
    eventId: {
      type: ["string", "null"],
      description: "Activity entry id; null when the entry could not be stored",
    },
    kind: { type: "string", enum: [...MEDIA_EVENT_KINDS] },
    targetName: { type: "string", description: "File or folder name" },
    assetId: { type: ["string", "null"] },
    folderId: {
      type: ["string", "null"],
      description:
        "As recorded: the file's folder, the parent of a created or deleted folder, the folder itself otherwise",
    },
    targetFolderId: {
      type: ["string", "null"],
      description: "The folder a folder entry is about",
    },
    count: { type: ["number", "null"] },
    size: { type: ["number", "null"] },
    details: {
      type: "object",
      description: "Kind-specific values as recorded",
    },
  },
});

function readableDetails(details: MediaEventDetails = {}): MediaEventDetails {
  const visibility = String(details.visibility ?? "");
  if (!visibility.startsWith(VISIBILITY_KEY_PREFIX)) return { ...details };
  return {
    ...details,
    visibility: visibility.slice(VISIBILITY_KEY_PREFIX.length),
  };
}

function targetFolderOf(event: RecordedMediaEvent): string | null {
  const { input, facts } = event;
  if (input.kind === "folder.create")
    return input.details?.targetId === undefined
      ? null
      : String(input.details.targetId);
  if (input.kind === "folder.delete") return facts.deletedFolder?._id ?? null;
  if (TARGETS_ITSELF.has(input.kind)) return input.folderId ?? null;
  return null;
}

/** Hands an activity entry to the `media.library-event` subscriptions. */
export async function emitLibraryEvent(
  event: RecordedMediaEvent,
  lookup: FolderLookup,
): Promise<void> {
  const { input } = event;
  const tenantId = event.actor.tenantId;
  const folderPathIds = input.folderId
    ? (await lookup.place(input.folderId)).folderPathIds
    : [];
  libraryEventChannel.emit(
    `${tenantId}:${input.assetId ?? input.folderId ?? input.targetName}`,
    {
      folderPathIds,
      payload: {
        ...commonFields(
          event,
          `media.library-event:${tenantId}:${event.eventId ?? randomUUID()}`,
        ),
        eventId: event.eventId ?? null,
        kind: input.kind,
        targetName: input.targetName,
        assetId: input.assetId ?? null,
        folderId: input.folderId ?? null,
        targetFolderId: targetFolderOf(event),
        count: input.count ?? null,
        size: input.size ?? null,
        details: readableDetails(input.details),
      },
    },
  );
}
