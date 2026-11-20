import type { MediaAsset } from "../../db";
import type { MediaFileSource } from "../../library/events";
import { resolveTypeGroup } from "../../library/type-groups";
import {
  buildDeliveryPath,
  resolveEffectiveVisibility,
} from "../../routes/media/dto";
import {
  channelTrigger,
  TriggerChannel,
  type TriggerSettings,
} from "../channel";
import {
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

type MemberSource = Exclude<MediaFileSource, "automation">;

export interface FileUploadedConfig extends TriggerSettings, FolderSettings {
  binding?: string;
  mimetypes?: string[];
  sources?: MemberSource[];
}

export type FileUploadedPayload = CommonFields & {
  assetId: string;
  source: MediaFileSource;
  name: string;
  mimetype: string;
  typeGroup: string;
  size: number;
  width: number | null;
  height: number | null;
  visibility: string;
  effectiveVisibility: string;
  folderId: string;
  folderName: string;
  folderPath: string;
  folderPathIds: string[];
  binding: string | null;
  batchId: string | null;
  copiedFromAssetId: string | null;
  deliveryPath: string;
};

const DEFAULT_SOURCES: readonly MemberSource[] = ["upload", "copy"];

export const fileUploadedChannel = new TriggerChannel<
  FileUploadedConfig,
  FileUploadedPayload
>("media.file-uploaded", (config, { payload, ...event }) => {
  const binding = config.binding?.trim();
  return (
    acceptsFolder(config, { payload, ...event }) &&
    (!binding || payload.binding === binding) &&
    acceptsMimetype(config.mimetypes, payload.mimetype) &&
    (payload.source === "automation" ||
      isChosen(config.sources, DEFAULT_SOURCES, payload.source))
  );
});

export const fileUploadedTrigger = channelTrigger(fileUploadedChannel, {
  name: "File added to the library",
  description:
    "Fires when a file is added to a tenant's media library: an upload, an edited copy, or (optional) a file declared by a module. Files a procedure creates fire only with `includeAutomationWrites`.",
  icon: "i-lucide-file-up",
  configProperties: {
    ...FOLDER_CONFIG,
    binding: {
      type: "string",
      maxLength: 255,
      description: "Only folders feeding this asset field.",
    },
    mimetypes: MIMETYPES_CONFIG,
    sources: {
      type: "array",
      minItems: 1,
      items: { type: "string", enum: ["upload", "copy", "declared"] },
      default: [...DEFAULT_SOURCES],
      description:
        "Paths that fire: a member's upload, a member's edited copy, a file declared by a module.",
    },
  },
  outputProperties: {
    ...FILE_OUTPUTS,
    source: {
      type: "string",
      enum: ["upload", "copy", "declared", "automation"],
    },
    width: { type: ["number", "null"] },
    height: { type: ["number", "null"] },
    visibility: { type: "string", enum: ["inherit", "private", "public"] },
    effectiveVisibility: { type: "string", enum: ["private", "public"] },
    ...FOLDER_OUTPUTS,
    folderPathIds: { type: "array", items: { type: "string" } },
    binding: { type: ["string", "null"] },
    batchId: { type: ["string", "null"] },
    copiedFromAssetId: { type: ["string", "null"] },
    deliveryPath: { type: "string" },
  },
});

/** Hands each file a write added to the `media.file-uploaded` subscriptions. */
export async function emitFileUploaded(
  event: RecordedMediaEvent,
  lookup: FolderLookup,
  assets: MediaAsset[],
): Promise<void> {
  const tenantId = event.actor.tenantId;
  const batchId = event.input.details?.batchId;
  for (const asset of assets) {
    const place = await lookup.place(asset.folderId);
    const folder = await lookup.get(asset.folderId);
    fileUploadedChannel.emit(`${tenantId}:${asset._id}`, {
      folderPathIds: place.folderPathIds,
      payload: {
        ...commonFields(event, `media.file-uploaded:${tenantId}:${asset._id}`),
        assetId: asset._id,
        source: event.facts.source ?? "upload",
        name: asset.name,
        mimetype: asset.mimetype,
        typeGroup: resolveTypeGroup(asset.mimetype),
        size: asset.size,
        width: asset.width ?? null,
        height: asset.height ?? null,
        visibility: asset.visibility,
        effectiveVisibility: resolveEffectiveVisibility(asset, folder),
        ...place,
        batchId: batchId === undefined ? null : String(batchId),
        copiedFromAssetId: event.facts.copiedFromAssetId ?? null,
        deliveryPath: buildDeliveryPath(asset),
      },
    });
  }
}
