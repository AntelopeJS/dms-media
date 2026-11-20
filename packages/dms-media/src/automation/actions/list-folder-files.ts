import { z } from "zod";
import { ASSET_TYPE_GROUPS } from "../../library/type-groups";
import { folderScope, listFiles } from "../../services/listing";
import { FILE_SUMMARY, fileSummary } from "./file-summary";
import {
  BINDING_INPUT,
  FOLDER_ID_INPUT,
  folderTargetFields,
  objectSchema,
  ONE_FOLDER_TARGET,
  oneFolderTarget,
  readAction,
  requireTargetFolder,
  TENANT_INPUT,
  tenantIdField,
} from "./support";

const SORT_KEYS = ["name", "date", "size", "type"] as const;
const DIRECTIONS = ["asc", "desc"] as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const input = z
  .object({
    tenantId: tenantIdField,
    ...folderTargetFields,
    includeSubfolders: z.boolean().default(false),
    type: z.enum(ASSET_TYPE_GROUPS).optional(),
    sort: z.enum(SORT_KEYS).default("name"),
    direction: z.enum(DIRECTIONS).default("asc"),
    limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.number().int().min(0).default(0),
  })
  .refine(oneFolderTarget, ONE_FOLDER_TARGET);

export const listFolderFilesAction = readAction({
  id: "media.list-folder-files",
  name: "List files in folder",
  description:
    "Lists the files of a media folder, optionally with its subfolders, one page at a time.",
  icon: "i-lucide-folder-open",
  inputSchema: objectSchema({
    tenantId: TENANT_INPUT,
    folderId: FOLDER_ID_INPUT,
    binding: BINDING_INPUT,
    includeSubfolders: {
      type: "boolean",
      default: false,
      description: "Also the files of every folder below",
    },
    type: { type: "string", enum: [...ASSET_TYPE_GROUPS] },
    sort: { type: "string", enum: [...SORT_KEYS], default: "name" },
    direction: { type: "string", enum: [...DIRECTIONS], default: "asc" },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: MAX_LIMIT,
      default: DEFAULT_LIMIT,
    },
    offset: { type: "integer", minimum: 0, default: 0 },
  }),
  outputSchema: objectSchema({
    files: { type: "array", items: FILE_SUMMARY },
    total: { type: "number", description: "Files matching, across every page" },
    hasMore: { type: "boolean" },
  }),
  input,
  async read(context, value) {
    const folder = requireTargetFolder(context, value);
    const page = await listFiles(
      context,
      folderScope(context, folder._id, value.includeSubfolders),
      value,
    );
    return {
      files: page.assets.map((asset) => fileSummary(context, asset)),
      total: page.total,
      hasMore: value.offset + page.assets.length < page.total,
    };
  },
});
