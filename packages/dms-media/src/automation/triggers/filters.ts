import type { JsonSchema } from "@antelopejs/interface-dms-automation";
import { mimetypeMatches } from "../../upload-policy";
import type { ChannelEvent, TriggerPayload } from "../channel";

/** Settings of a trigger that narrows on where the change happened. */
export interface FolderSettings {
  folderId?: string;
  includeSubfolders?: boolean;
}

export const FOLDER_CONFIG = {
  folderId: {
    type: "string",
    maxLength: 64,
    description: "Only changes in this folder. Leave empty for any folder.",
  },
  includeSubfolders: {
    type: "boolean",
    default: true,
    description: "With a folder, also the folders below it.",
  },
} satisfies Record<string, JsonSchema>;

export const MIMETYPES_CONFIG: JsonSchema = {
  type: "array",
  maxItems: 20,
  items: { type: "string", maxLength: 100 },
  default: [],
  description:
    "Only files of these types (`image/*` matches a prefix). Empty for any type.",
};

/** Whether the change happened where the settings look. */
export function acceptsFolder(
  config: FolderSettings,
  event: ChannelEvent<TriggerPayload>,
): boolean {
  const folderId = config.folderId?.trim();
  if (!folderId) return true;
  const pathIds = event.folderPathIds ?? [];
  if (config.includeSubfolders === false) return pathIds.at(-1) === folderId;
  return pathIds.includes(folderId);
}

/** Whether a file type is among the wanted ones; none wanted takes any. */
export function acceptsMimetype(
  patterns: readonly string[] | undefined,
  mimetype: string,
): boolean {
  return !patterns?.length || mimetypeMatches(mimetype, patterns);
}

/** Whether a value is among the chosen ones, or the defaults when none are. */
export function isChosen<T extends string>(
  chosen: readonly T[] | undefined,
  defaults: readonly T[],
  value: T,
): boolean {
  return (chosen?.length ? chosen : defaults).includes(value);
}

export const FILE_OUTPUTS = {
  assetId: { type: "string", description: "File id" },
  name: { type: "string", description: "File name" },
  mimetype: { type: "string", description: "Stored mimetype" },
  typeGroup: {
    type: "string",
    enum: [
      "image",
      "video",
      "audio",
      "pdf",
      "document",
      "spreadsheet",
      "vector",
      "archive",
      "other",
    ],
  },
  size: { type: "number", description: "Bytes" },
} satisfies Record<string, JsonSchema>;

export const FOLDER_OUTPUTS = {
  folderId: { type: "string", description: "Folder id" },
  folderName: { type: "string", description: "Folder name" },
  folderPath: {
    type: "string",
    description: "Folder names from the root, joined with `/`",
  },
} satisfies Record<string, JsonSchema>;
