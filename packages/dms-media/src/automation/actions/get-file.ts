import { z } from "zod";
import { buildDeliveryPath } from "../../routes/media/dto";
import { describeFile } from "../../services/reads";
import { FILE_SUMMARY_PROPERTIES, fileSummary } from "./file-summary";
import {
  ASSET_ID_INPUT,
  assetIdField,
  objectSchema,
  readAction,
  requireFile,
  TENANT_INPUT,
  tenantIdField,
} from "./support";

export const getFileAction = readAction({
  id: "media.get-file",
  name: "Get file",
  description:
    "Reads a media library file's details: name, type, size, dimensions, folder, visibility, uploader, links.",
  icon: "i-lucide-file-search",
  inputSchema: objectSchema(
    { tenantId: TENANT_INPUT, assetId: ASSET_ID_INPUT },
    ["assetId"],
  ),
  outputSchema: objectSchema({
    ...FILE_SUMMARY_PROPERTIES,
    storedSize: {
      type: "number",
      description: "Bytes kept, the pre-edit original included",
    },
    isEdited: { type: "boolean", description: "Has a pre-edit original" },
    folderName: { type: "string" },
    folderPath: {
      type: "string",
      description: "Folder names from the root, joined with `/`",
    },
    binding: {
      type: ["string", "null"],
      description: "Asset field the folder feeds",
    },
    uploaderId: { type: "string" },
    uploaderName: {
      type: ["string", "null"],
      description:
        "Member name or email, `System`, `Automation`; null when the member no longer exists",
    },
    deliveryUrl: {
      type: "string",
      description: "Stable link; relative when no public origin is configured",
    },
    dashboardUrl: {
      type: "string",
      description: "The file's page in the dashboard",
    },
  }),
  input: z.object({ tenantId: tenantIdField, assetId: assetIdField }),
  async read(context, { assetId }) {
    const asset = await requireFile(context, assetId);
    const described = await describeFile(
      context,
      asset,
      buildDeliveryPath(asset),
    );
    return {
      ...fileSummary(context, asset),
      storedSize: asset.size + (asset.originalSize ?? 0),
      isEdited: Boolean(asset.originalKey),
      folderName: described.folder.name,
      folderPath: described.folderPath,
      binding: described.binding,
      uploaderId: asset.createdBy,
      uploaderName: described.uploaderName,
      deliveryUrl: described.deliveryUrl,
      dashboardUrl: described.dashboardUrl,
    };
  },
});
