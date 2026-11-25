import { z } from "zod";
import type { MediaAsset } from "../../db";
import {
  applyFolderDeletion,
  type FolderDeletionPlan,
  planFolderDeletion,
} from "../../services/folders";
import {
  objectSchema,
  requireTargetFolder,
  TENANT_INPUT,
  tenantIdField,
  writeAction,
} from "./support";

const DEFAULT_MAX_FILES = 500;
const MAX_MAX_FILES = 10_000;

const input = z.object({
  tenantId: tenantIdField,
  folderId: z.string().trim().min(1).max(64),
  maxFiles: z
    .number()
    .int()
    .min(0)
    .max(MAX_MAX_FILES)
    .default(DEFAULT_MAX_FILES),
});

const storedBytes = (assets: MediaAsset[]) =>
  assets.reduce(
    (total, asset) => total + asset.size + (asset.originalSize ?? 0),
    0,
  );

function outputOf(plan: FolderDeletionPlan, deleted: MediaAsset[]) {
  return {
    folderId: plan.folder._id,
    name: plan.folder.name,
    deletedFolders: plan.folderIds.length,
    deletedFiles: deleted.length,
    freedBytes: storedBytes(deleted),
  };
}

export const deleteFolderAction = writeAction({
  id: "media.delete-folder",
  name: "Delete folder",
  description:
    "Deletes a media folder with its subfolders and files. Cannot be undone. Folders linked to an asset field cannot be deleted.",
  icon: "i-lucide-folder-x",
  inputSchema: objectSchema(
    {
      tenantId: TENANT_INPUT,
      folderId: {
        type: "string",
        maxLength: 64,
        description: "Folder id. Linked folders are refused.",
      },
      maxFiles: {
        type: "integer",
        minimum: 0,
        maximum: MAX_MAX_FILES,
        default: DEFAULT_MAX_FILES,
        description: "Refuse when more files than this would be deleted.",
      },
    },
    ["folderId"],
  ),
  outputSchema: objectSchema({
    folderId: { type: "string" },
    name: { type: "string" },
    deletedFolders: { type: "number" },
    deletedFiles: { type: "number" },
    freedBytes: { type: "number" },
  }),
  input,
  async plan(context, value) {
    const folder = requireTargetFolder(context, value);
    const plan = await planFolderDeletion(context, folder._id);
    if (plan.assets.length > value.maxFiles)
      throw new Error(
        `the folder holds ${plan.assets.length} files, more than maxFiles (${value.maxFiles}): nothing was deleted`,
      );
    return plan;
  },
  async apply(context, plan) {
    return outputOf(plan, await applyFolderDeletion(context, plan));
  },
  simulate: (plan) => outputOf(plan, plan.assets),
  skipped: (plan) =>
    `deletion of folder ${plan.folder._id} with ${plan.folderIds.length} folders and ${plan.assets.length} files`,
});
