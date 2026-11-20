import type { JsonSchema } from "@antelopejs/interface-dms-automation";
import type { MediaAsset } from "../../db";
import { ASSET_TYPE_GROUPS, resolveTypeGroup } from "../../library/type-groups";
import type { MediaRequestContext } from "../../routes/media/context";
import {
  buildDeliveryPath,
  resolveEffectiveVisibility,
} from "../../routes/media/dto";

/** A file as the read actions describe it. */
export function fileSummary(context: MediaRequestContext, asset: MediaAsset) {
  return {
    assetId: asset._id,
    name: asset.name,
    mimetype: asset.mimetype,
    typeGroup: resolveTypeGroup(asset.mimetype),
    size: asset.size,
    width: asset.width ?? null,
    height: asset.height ?? null,
    alt: asset.alt || null,
    visibility: asset.visibility,
    effectiveVisibility: resolveEffectiveVisibility(
      asset,
      context.foldersById.get(asset.folderId),
    ),
    folderId: asset.folderId,
    deliveryPath: buildDeliveryPath(asset),
    createdAt: new Date(asset.createdAt).toISOString(),
    updatedAt: new Date(asset.updatedAt).toISOString(),
  };
}

export const FILE_SUMMARY_PROPERTIES = {
  assetId: { type: "string" },
  name: { type: "string" },
  mimetype: { type: "string", description: "Stored mimetype" },
  typeGroup: { type: "string", enum: [...ASSET_TYPE_GROUPS] },
  size: { type: "number", description: "Bytes" },
  width: {
    type: ["number", "null"],
    description: "Displayed width, null when unknown",
  },
  height: {
    type: ["number", "null"],
    description: "Displayed height, null when unknown",
  },
  alt: { type: ["string", "null"] },
  visibility: {
    type: "string",
    enum: ["inherit", "private", "public"],
    description: "The file's own setting",
  },
  effectiveVisibility: { type: "string", enum: ["private", "public"] },
  folderId: { type: "string" },
  deliveryPath: { type: "string", description: "`/media/<id>/<name>`" },
  createdAt: { type: "string" },
  updatedAt: { type: "string" },
} satisfies Record<string, JsonSchema>;

export const FILE_SUMMARY: JsonSchema = {
  type: "object",
  properties: FILE_SUMMARY_PROPERTIES,
};
