import { z } from "zod";
import {
  applyAssetMove,
  type MovePlan,
  planAssetMove,
} from "../../services/files";
import {
  ASSET_ID_INPUT,
  assetIdField,
  BINDING_INPUT,
  FOLDER_ID_INPUT,
  folderTargetFields,
  objectSchema,
  ONE_FOLDER_TARGET,
  oneFolderTarget,
  requireFile,
  requireTargetFolder,
  TENANT_INPUT,
  tenantIdField,
  writeAction,
} from "./support";

const VISIBILITIES = ["private", "public"];

const input = z
  .object({
    tenantId: tenantIdField,
    assetId: assetIdField,
    ...folderTargetFields,
  })
  .refine(oneFolderTarget, ONE_FOLDER_TARGET);

function outputOf(plan: MovePlan) {
  return {
    assetId: plan.asset._id,
    folderId: plan.target._id,
    previousFolderId: plan.source._id,
    moved: plan.moved,
    effectiveVisibility: plan.effective,
    previousEffectiveVisibility: plan.previousEffective,
  };
}

export const moveFileAction = writeAction({
  id: "media.move-file",
  name: "Move file",
  description: "Moves a media file to another folder.",
  icon: "i-lucide-folder-input",
  inputSchema: objectSchema(
    {
      tenantId: TENANT_INPUT,
      assetId: ASSET_ID_INPUT,
      folderId: FOLDER_ID_INPUT,
      binding: BINDING_INPUT,
    },
    ["assetId"],
  ),
  outputSchema: objectSchema({
    assetId: { type: "string" },
    folderId: { type: "string" },
    previousFolderId: { type: "string" },
    moved: {
      type: "boolean",
      description: "False when the file was already in the folder",
    },
    effectiveVisibility: { type: "string", enum: VISIBILITIES },
    previousEffectiveVisibility: { type: "string", enum: VISIBILITIES },
  }),
  input,
  async plan(context, value) {
    const asset = await requireFile(context, value.assetId);
    const target = requireTargetFolder(context, value);
    return planAssetMove(context, asset, target._id);
  },
  async apply(context, plan) {
    await applyAssetMove(context, plan);
    return outputOf(plan);
  },
  simulate: outputOf,
  skipped: (plan) =>
    `move of file ${plan.asset._id} to folder ${plan.target._id}`,
});
