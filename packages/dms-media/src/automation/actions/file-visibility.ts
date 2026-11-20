import { z } from "zod";
import {
  applyAssetVisibility,
  planAssetVisibility,
  type VisibilityPlan,
} from "../../services/files";
import {
  ASSET_ID_INPUT,
  assetIdField,
  objectSchema,
  requireFile,
  TENANT_INPUT,
  tenantIdField,
  writeAction,
} from "./support";

const ASSET_VISIBILITIES = ["inherit", "private", "public"] as const;
const EFFECTIVE = ["private", "public"];

const input = z.object({
  tenantId: tenantIdField,
  assetId: assetIdField,
  visibility: z.enum(ASSET_VISIBILITIES),
});

function outputOf(plan: VisibilityPlan) {
  return {
    assetId: plan.asset._id,
    visibility: plan.visibility,
    previousVisibility: plan.asset.visibility,
    effectiveVisibility: plan.effective,
    previousEffectiveVisibility: plan.previousEffective,
    changed: plan.changed,
  };
}

export const setFileVisibilityAction = writeAction({
  id: "media.set-file-visibility",
  name: "Set file visibility",
  description:
    "Makes a media file public, private, or follow its folder. A public file is served to anyone holding its link.",
  icon: "i-lucide-eye",
  inputSchema: objectSchema(
    {
      tenantId: TENANT_INPUT,
      assetId: ASSET_ID_INPUT,
      visibility: { type: "string", enum: [...ASSET_VISIBILITIES] },
    },
    ["assetId", "visibility"],
  ),
  outputSchema: objectSchema({
    assetId: { type: "string" },
    visibility: { type: "string", enum: [...ASSET_VISIBILITIES] },
    previousVisibility: { type: "string", enum: [...ASSET_VISIBILITIES] },
    effectiveVisibility: { type: "string", enum: EFFECTIVE },
    previousEffectiveVisibility: { type: "string", enum: EFFECTIVE },
    changed: {
      type: "boolean",
      description:
        "False when the file already had this setting: nothing is written",
    },
  }),
  input,
  async plan(context, { assetId, visibility }) {
    const asset = await requireFile(context, assetId);
    return planAssetVisibility(context, asset, visibility);
  },
  async apply(context, plan) {
    if (plan.changed) await applyAssetVisibility(context, plan);
    return outputOf(plan);
  },
  simulate: outputOf,
  skipped: (plan) =>
    `visibility of file ${plan.asset._id} set to ${plan.visibility}`,
});
