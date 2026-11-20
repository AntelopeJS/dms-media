import { randomUUID } from "node:crypto";
import type { MediaAsset } from "../../db";
import { resolveTypeGroup } from "../../library/type-groups";
import {
  buildDeliveryPath,
  resolveEffectiveVisibility,
} from "../../routes/media/dto";
import type { FolderVisibility } from "../../types";
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
  acceptsMimetype,
  FILE_OUTPUTS,
  FOLDER_CONFIG,
  FOLDER_OUTPUTS,
  type FolderSettings,
  isChosen,
  MIMETYPES_CONFIG,
} from "./filters";

export type PublishReason = "visibility" | "move" | "folder" | "created";

type MemberActor = Exclude<ActorKind, "automation">;

export interface FilePublishedConfig extends TriggerSettings, FolderSettings {
  mimetypes?: string[];
  reasons?: PublishReason[];
  actors?: MemberActor[];
}

export type FilePublishedPayload = CommonFields & {
  assetId: string;
  name: string;
  mimetype: string;
  typeGroup: string;
  size: number;
  visibility: string;
  reason: PublishReason;
  previousEffectiveVisibility: string | null;
  folderId: string;
  folderName: string;
  folderPath: string;
  deliveryPath: string;
};

const ALL_REASONS: readonly PublishReason[] = [
  "visibility",
  "move",
  "folder",
  "created",
];
const DEFAULT_REASONS: readonly PublishReason[] = [
  "visibility",
  "move",
  "folder",
];
const DEFAULT_ACTORS: readonly MemberActor[] = ["member"];

export const filePublishedChannel = new TriggerChannel<
  FilePublishedConfig,
  FilePublishedPayload
>(
  "media.file-published",
  (config, event) =>
    acceptsFolder(config, event) &&
    acceptsMimetype(config.mimetypes, event.payload.mimetype) &&
    isChosen(config.reasons, DEFAULT_REASONS, event.payload.reason) &&
    (event.payload.actorKind === "automation" ||
      isChosen(config.actors, DEFAULT_ACTORS, event.payload.actorKind)),
);

export const filePublishedTrigger = channelTrigger(filePublishedChannel, {
  name: "File made public",
  description:
    "Fires for each file whose effective visibility becomes public: its own setting changed, it moved into a public folder, or its folder was made public.",
  icon: "i-lucide-globe",
  configProperties: {
    ...FOLDER_CONFIG,
    mimetypes: MIMETYPES_CONFIG,
    reasons: {
      type: "array",
      minItems: 1,
      items: { type: "string", enum: [...ALL_REASONS] },
      default: [...DEFAULT_REASONS],
      description:
        "Changes that fire. `created` fires for a file added already public.",
    },
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
    ...FILE_OUTPUTS,
    visibility: {
      type: "string",
      enum: ["inherit", "private", "public"],
      description: "The file's own setting after the change",
    },
    reason: { type: "string", enum: [...ALL_REASONS] },
    previousEffectiveVisibility: {
      type: ["string", "null"],
      description: "`private`, or null for a file added public",
    },
    ...FOLDER_OUTPUTS,
    deliveryPath: { type: "string" },
  },
});

/**
 * Hands each file a write made public to the `media.file-published`
 * subscriptions. `previousOf` gives a file's effective visibility before the
 * write; without it the files were just added.
 */
export async function emitFilePublished(
  event: RecordedMediaEvent,
  lookup: FolderLookup,
  assets: MediaAsset[],
  reason: PublishReason,
  previousOf?: (asset: MediaAsset) => FolderVisibility,
): Promise<void> {
  const tenantId = event.actor.tenantId;
  const changeId = event.eventId ?? randomUUID();
  for (const asset of assets) {
    const folder = await lookup.get(asset.folderId);
    if (resolveEffectiveVisibility(asset, folder) !== "public") continue;
    const previous = previousOf?.(asset) ?? null;
    if (previous === "public") continue;
    const { folderPathIds, ...place } = await lookup.place(asset.folderId);
    filePublishedChannel.emit(`${tenantId}:${asset._id}`, {
      folderPathIds,
      payload: {
        ...commonFields(
          event,
          `media.file-published:${tenantId}:${asset._id}:${changeId}`,
        ),
        assetId: asset._id,
        name: asset.name,
        mimetype: asset.mimetype,
        typeGroup: resolveTypeGroup(asset.mimetype),
        size: asset.size,
        visibility: asset.visibility,
        reason,
        previousEffectiveVisibility: previous,
        folderId: place.folderId,
        folderName: place.folderName,
        folderPath: place.folderPath,
        deliveryPath: buildDeliveryPath(asset),
      },
    });
  }
}
