import { z } from "zod";
import type { MediaRequestContext } from "../../routes/media/context";
import {
  applyFolderVisibility,
  type FolderVisibilityPlan,
  loadInheritingFiles,
  planFolderVisibility,
} from "../../services/folders";
import {
  BINDING_INPUT,
  FOLDER_ID_INPUT,
  folderTargetFields,
  objectSchema,
  ONE_FOLDER_TARGET,
  oneFolderTarget,
  requireTargetFolder,
  TENANT_INPUT,
  tenantIdField,
  writeAction,
} from "./support";

const FOLDER_VISIBILITIES = ["private", "public"] as const;

const input = z
  .object({
    tenantId: tenantIdField,
    ...folderTargetFields,
    visibility: z.enum(FOLDER_VISIBILITIES),
  })
  .refine(oneFolderTarget, ONE_FOLDER_TARGET);

interface Plan {
  change: FolderVisibilityPlan;
  affectedFiles: number;
}

async function planOf(
  context: MediaRequestContext,
  change: FolderVisibilityPlan,
): Promise<Plan> {
  const affectedFiles = change.changed
    ? (await loadInheritingFiles(context, change.folder._id)).length
    : 0;
  return { change, affectedFiles };
}

function outputOf({ change, affectedFiles }: Plan) {
  return {
    folderId: change.folder._id,
    visibility: change.visibility,
    previousVisibility: change.folder.visibility,
    changed: change.changed,
    affectedFiles,
  };
}

export const setFolderVisibilityAction = writeAction({
  id: "media.set-folder-visibility",
  name: "Set folder visibility",
  description:
    "Makes a media folder public or private. Files of the folder that follow it change with it; subfolders keep their own setting.",
  icon: "i-lucide-folder-lock",
  inputSchema: objectSchema(
    {
      tenantId: TENANT_INPUT,
      folderId: FOLDER_ID_INPUT,
      binding: BINDING_INPUT,
      visibility: { type: "string", enum: [...FOLDER_VISIBILITIES] },
    },
    ["visibility"],
  ),
  outputSchema: objectSchema({
    folderId: { type: "string" },
    visibility: { type: "string", enum: [...FOLDER_VISIBILITIES] },
    previousVisibility: { type: "string", enum: [...FOLDER_VISIBILITIES] },
    changed: {
      type: "boolean",
      description:
        "False when the folder already had this setting: nothing is written",
    },
    affectedFiles: {
      type: "number",
      description: "Live files directly in the folder that follow it",
    },
  }),
  input,
  async plan(context, value) {
    const folder = requireTargetFolder(context, value);
    return planOf(
      context,
      planFolderVisibility(context, folder._id, value.visibility),
    );
  },
  async apply(context, plan) {
    if (plan.change.changed) await applyFolderVisibility(context, plan.change);
    return outputOf(plan);
  },
  simulate: outputOf,
  skipped: ({ change }) =>
    `visibility of folder ${change.folder._id} set to ${change.visibility}`,
});
