import type {
  DataNodeType,
  JsonObject,
} from "@antelopejs/interface-dms-automation";
import { z } from "zod";
import { EDITABLE_IMAGE_MIMETYPES } from "../../constants";
import { ASSET_TYPE_GROUPS, resolveTypeGroup } from "../../library/type-groups";
import { parseData } from "./delivery-url";

const input = z.object({ mimetype: z.string().trim().min(1).max(255) });

export const typeGroupData: DataNodeType<JsonObject> = {
  id: "media.type-group",
  category: "media",
  name: "File type group",
  description:
    "Classifies a mimetype the way the media library does, for branching.",
  icon: "i-lucide-shapes",
  inputSchema: {
    type: "object",
    properties: { mimetype: { type: "string", maxLength: 255 } },
    required: ["mimetype"],
  },
  outputSchema: {
    type: "object",
    properties: {
      group: { type: "string", enum: [...ASSET_TYPE_GROUPS] },
      isImage: {
        type: "boolean",
        description: "An image, vectors included: image sizes exist for it",
      },
      isEditable: {
        type: "boolean",
        description:
          "A JPEG, PNG, WebP or AVIF image the editor crops and rotates",
      },
    },
  },
  evaluate(value) {
    const mimetype = parseData(
      "media.type-group",
      input,
      value,
    ).mimetype.toLowerCase();
    return {
      group: resolveTypeGroup(mimetype),
      isImage: mimetype.startsWith("image/"),
      isEditable: EDITABLE_IMAGE_MIMETYPES.has(mimetype),
    };
  },
};
