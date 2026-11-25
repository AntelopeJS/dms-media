import type { MediaAsset } from "../../db";
import { z } from "zod";
import { applyAssetRemoval, planAssetRemoval } from "../../services/files";
import {
  ASSET_ID_INPUT,
  assetIdField,
  objectSchema,
  requireFile,
  TENANT_INPUT,
  tenantIdField,
  writeAction,
} from "./support";

const input = z.object({ tenantId: tenantIdField, assetId: assetIdField });

function outputOf(asset: MediaAsset) {
  return {
    assetId: asset._id,
    name: asset.name,
    folderId: asset.folderId,
    size: asset.size,
    storedSize: asset.size + (asset.originalSize ?? 0),
    deleted: true,
  };
}

export const deleteFileAction = writeAction({
  id: "media.delete-file",
  name: "Delete file",
  description: "Deletes a media file and its stored copies. Cannot be undone.",
  icon: "i-lucide-trash-2",
  inputSchema: objectSchema(
    { tenantId: TENANT_INPUT, assetId: ASSET_ID_INPUT },
    ["assetId"],
  ),
  outputSchema: objectSchema({
    assetId: { type: "string" },
    name: { type: "string" },
    folderId: { type: "string" },
    size: { type: "number" },
    storedSize: {
      type: "number",
      description: "Bytes freed, the pre-edit original included",
    },
    deleted: { type: "boolean" },
  }),
  input,
  async plan(context, { assetId }) {
    return planAssetRemoval(context, await requireFile(context, assetId));
  },
  async apply(context, asset) {
    await applyAssetRemoval(context, asset);
    return outputOf(asset);
  },
  simulate: outputOf,
  skipped: (asset) => `deletion of file ${asset._id}`,
});
