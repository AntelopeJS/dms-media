import type {
  DataNodeType,
  JsonObject,
} from "@antelopejs/interface-dms-automation";
import { z } from "zod";
import { bindingFolderId } from "../../bindings";
import { tenantIdField } from "../actions/support";
import { parseData } from "./delivery-url";

const input = z.object({
  tenantId: tenantIdField,
  binding: z.string().trim().min(1).max(255),
});

export const bindingFolderIdData: DataNodeType<JsonObject> = {
  id: "media.binding-folder-id",
  category: "media",
  name: "Folder of an asset field",
  description:
    "Gives the id of the folder linked to an asset field in a tenant.",
  icon: "i-lucide-folder-symlink",
  inputSchema: {
    type: "object",
    properties: {
      tenantId: {
        type: "string",
        maxLength: 255,
        description: "Tenant id; empty uses the default tenant",
      },
      binding: {
        type: "string",
        maxLength: 255,
        description: "Asset field id",
      },
    },
    required: ["binding"],
  },
  outputSchema: {
    type: "object",
    properties: { folderId: { type: "string" } },
  },
  evaluate(value) {
    const { tenantId, binding } = parseData(
      "media.binding-folder-id",
      input,
      value,
    );
    return { folderId: bindingFolderId(tenantId, binding) };
  },
};
