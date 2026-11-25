import type { MediaAsset } from "../../db";
import { resolveTypeGroup } from "../../library/type-groups";
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

type DeleteCause = "file" | "folder";

export interface FileDeletedConfig extends TriggerSettings, FolderSettings {
  mimetypes?: string[];
  causes?: DeleteCause[];
}

export type FileDeletedPayload = CommonFields & {
  assetId: string;
  name: string;
  mimetype: string;
  typeGroup: string;
  size: number;
  storedSize: number;
  folderId: string;
  folderName: string;
  folderPath: string;
  cause: DeleteCause;
  deletedFolderId: string | null;
  deletedFolderName: string | null;
};

const ALL_CAUSES: readonly DeleteCause[] = ["file", "folder"];

export const fileDeletedChannel = new TriggerChannel<
  FileDeletedConfig,
  FileDeletedPayload
>(
  "media.file-deleted",
  (config, event) =>
    acceptsFolder(config, event) &&
    acceptsMimetype(config.mimetypes, event.payload.mimetype) &&
    isChosen(config.causes, ALL_CAUSES, event.payload.cause),
);

export const fileDeletedTrigger = channelTrigger(fileDeletedChannel, {
  name: "File deleted",
  description:
    "Fires for each file removed from a tenant's media library, whether deleted on its own or with its folder.",
  icon: "i-lucide-file-x",
  configProperties: {
    ...FOLDER_CONFIG,
    mimetypes: MIMETYPES_CONFIG,
    causes: {
      type: "array",
      minItems: 1,
      items: { type: "string", enum: [...ALL_CAUSES] },
      default: [...ALL_CAUSES],
      description: "Deleted on its own, or with its folder.",
    },
  },
  outputProperties: {
    ...FILE_OUTPUTS,
    storedSize: {
      type: "number",
      description: "Bytes freed, the pre-edit original included",
    },
    ...FOLDER_OUTPUTS,
    cause: { type: "string", enum: [...ALL_CAUSES] },
    deletedFolderId: { type: ["string", "null"] },
    deletedFolderName: { type: ["string", "null"] },
  },
});

/** Hands each file a delete removed to the `media.file-deleted` subscriptions. */
export async function emitFileDeleted(
  event: RecordedMediaEvent,
  lookup: FolderLookup,
  assets: MediaAsset[],
): Promise<void> {
  const tenantId = event.actor.tenantId;
  const deletedFolder = event.facts.deletedFolder;
  for (const asset of assets) {
    const { folderPathIds, ...place } = await lookup.place(asset.folderId);
    fileDeletedChannel.emit(`${tenantId}:${asset._id}`, {
      folderPathIds,
      payload: {
        ...commonFields(event, `media.file-deleted:${tenantId}:${asset._id}`),
        assetId: asset._id,
        name: asset.name,
        mimetype: asset.mimetype,
        typeGroup: resolveTypeGroup(asset.mimetype),
        size: asset.size,
        storedSize: asset.size + (asset.originalSize ?? 0),
        folderId: place.folderId,
        folderName: place.folderName,
        folderPath: place.folderPath,
        cause: deletedFolder ? "folder" : "file",
        deletedFolderId: deletedFolder?._id ?? null,
        deletedFolderName: deletedFolder?.name ?? null,
      },
    });
  }
}
