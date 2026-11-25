import { z } from "zod";
import {
  applyAssetDetails,
  type DetailsPlan,
  planAssetDetails,
} from "../../services/files";
import { altSchema, nameSchema } from "../../validation/media.schema";
import {
  ASSET_ID_INPUT,
  assetIdField,
  objectSchema,
  requireFile,
  TENANT_INPUT,
  tenantIdField,
  writeAction,
} from "./support";

const input = z
  .object({
    tenantId: tenantIdField,
    assetId: assetIdField,
    name: nameSchema.optional(),
    alt: altSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.alt !== undefined, {
    message: "give a name, an alt text or both",
  });

function outputOf(plan: DetailsPlan) {
  const { asset, changes } = plan;
  return {
    assetId: asset._id,
    name: changes.name ?? asset.name,
    alt: (changes.alt ?? asset.alt) || null,
    renamed: plan.isRename,
    altChanged: plan.isAltChange,
  };
}

export const updateFileDetailsAction = writeAction({
  id: "media.update-file-details",
  name: "Rename file or set alt text",
  description: "Renames a media file and/or sets its alt text.",
  icon: "i-lucide-pencil",
  inputSchema: objectSchema(
    {
      tenantId: TENANT_INPUT,
      assetId: ASSET_ID_INPUT,
      name: {
        type: "string",
        maxLength: 255,
        description:
          "New name; refused when another file of the folder has it. Leave unset to keep it.",
      },
      alt: {
        type: "string",
        maxLength: 255,
        description: "New alt text; empty clears it. Leave unset to keep it.",
      },
    },
    ["assetId"],
  ),
  outputSchema: objectSchema({
    assetId: { type: "string" },
    name: { type: "string" },
    alt: { type: ["string", "null"] },
    renamed: { type: "boolean" },
    altChanged: { type: "boolean" },
  }),
  input,
  async plan(context, { assetId, name, alt }) {
    const asset = await requireFile(context, assetId);
    return planAssetDetails(context, asset, { name, alt });
  },
  async apply(context, plan) {
    await applyAssetDetails(context, plan);
    return outputOf(plan);
  },
  simulate: outputOf,
  skipped: (plan) => `update of file ${plan.asset._id}`,
});
