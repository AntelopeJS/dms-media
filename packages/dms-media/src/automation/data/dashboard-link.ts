import type {
  DataNodeType,
  JsonObject,
} from "@antelopejs/interface-dms-automation";
import { z } from "zod";
import { fileLink, folderLink } from "../../library/links";
import { ORIGIN_INPUT, originField, parseData } from "./delivery-url";

const optionalId = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => value || undefined);

const input = z
  .object({ assetId: optionalId, folderId: optionalId, origin: originField })
  .refine(
    (value) => value.assetId !== undefined || value.folderId !== undefined,
    { message: "give a file, a folder or both" },
  );

export const dashboardLinkData: DataNodeType<JsonObject> = {
  id: "media.dashboard-link",
  category: "media",
  name: "Dashboard link",
  description:
    "Builds dashboard links to a file page or a folder, for messages to members (opening them needs a session).",
  icon: "i-lucide-external-link",
  inputSchema: {
    type: "object",
    properties: {
      assetId: { type: "string", maxLength: 64 },
      folderId: { type: "string", maxLength: 64 },
      origin: {
        ...ORIGIN_INPUT,
        description:
          "Dashboard origin, such as https://admin.example.com. Empty gives a path.",
      },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      fileUrl: { type: "string", description: "Empty without a file" },
      folderUrl: { type: "string", description: "Empty without a folder" },
    },
  },
  evaluate(value) {
    const { assetId, folderId, origin } = parseData(
      "media.dashboard-link",
      input,
      value,
    );
    return {
      fileUrl: assetId ? `${origin}${fileLink(assetId)}` : "",
      folderUrl: folderId ? `${origin}${folderLink(folderId)}` : "",
    };
  },
};
