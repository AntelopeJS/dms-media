import { z } from "zod";
import { ASSET_TYPE_GROUPS } from "../../library/type-groups";
import { folderScope, searchFiles } from "../../services/listing";
import { FILE_SUMMARY_PROPERTIES, fileSummary } from "./file-summary";
import {
  BINDING_INPUT,
  FOLDER_ID_INPUT,
  folderTargetFields,
  objectSchema,
  readAction,
  requireTargetFolder,
  TENANT_INPUT,
  tenantIdField,
} from "./support";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_QUERY_LENGTH = 200;

const input = z
  .object({
    tenantId: tenantIdField,
    query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
    ...folderTargetFields,
    type: z.enum(ASSET_TYPE_GROUPS).optional(),
    limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.number().int().min(0).default(0),
  })
  .refine(
    (value) => value.folderId === undefined || value.binding === undefined,
    { message: "give folderId or binding, not both" },
  );

export const searchFilesAction = readAction({
  id: "media.search-files",
  name: "Search files",
  description:
    "Finds media files by words in their name, alt text or folder names, ignoring case and accents.",
  icon: "i-lucide-search",
  inputSchema: objectSchema(
    {
      tenantId: TENANT_INPUT,
      query: {
        type: "string",
        maxLength: MAX_QUERY_LENGTH,
        description:
          "Words; each must appear in the name, the folder path or the alt text, one at least in the name or alt text",
      },
      folderId: {
        ...FOLDER_ID_INPUT,
        description:
          "Search this folder and its subfolders. Empty searches the whole library.",
      },
      binding: BINDING_INPUT,
      type: { type: "string", enum: [...ASSET_TYPE_GROUPS] },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: MAX_LIMIT,
        default: DEFAULT_LIMIT,
      },
      offset: { type: "integer", minimum: 0, default: 0 },
    },
    ["query"],
  ),
  outputSchema: objectSchema({
    files: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ...FILE_SUMMARY_PROPERTIES,
          matchedOn: { type: "string", enum: ["name", "alt"] },
        },
      },
    },
    total: { type: "number" },
    hasMore: { type: "boolean" },
  }),
  input,
  async read(context, value) {
    const isScoped =
      value.folderId !== undefined || value.binding !== undefined;
    const scope = isScoped
      ? folderScope(context, requireTargetFolder(context, value)._id, true)
      : context.folders.map((folder) => folder._id);
    const page = await searchFiles(context, scope, {
      ...value,
      q: value.query,
    });
    return {
      files: page.assets.map((asset) => ({
        ...fileSummary(context, asset),
        matchedOn: page.matchedOn.get(asset._id) ?? "name",
      })),
      total: page.total,
      hasMore: value.offset + page.assets.length < page.total,
    };
  },
});
