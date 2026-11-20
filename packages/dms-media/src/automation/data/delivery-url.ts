import type {
  DataNodeType,
  JsonObject,
} from "@antelopejs/interface-dms-automation";
import { z } from "zod";

const TRAILING_SLASHES = /\/+$/;

export const originField = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .transform((value) => (value ?? "").replace(TRAILING_SLASHES, ""));

const input = z.object({
  assetId: z.string().trim().min(1).max(64),
  name: z.string().min(1).max(255),
  preset: z.string().trim().max(64).optional(),
  origin: originField,
});

export const ORIGIN_INPUT = {
  type: "string",
  maxLength: 2048,
  description:
    "Origin the link starts with, such as https://api.example.com. Empty gives a path.",
};

/** Throws the first refused field, failing the step that reads the node. */
export function parseData<T>(
  nodeId: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: JsonObject,
): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  throw new Error(
    `${nodeId}: invalid input (${issue?.path.join(".") || "input"}: ${issue?.message ?? "invalid"})`,
  );
}

export const deliveryUrlData: DataNodeType<JsonObject> = {
  id: "media.delivery-url",
  category: "media",
  name: "Delivery link",
  description:
    "Builds the stable link of a file or of one of its image sizes. Public files only: a private file asks for a sign-in.",
  icon: "i-lucide-link-2",
  inputSchema: {
    type: "object",
    properties: {
      assetId: { type: "string", maxLength: 64 },
      name: {
        type: "string",
        maxLength: 255,
        description: "The file's current name",
      },
      preset: {
        type: "string",
        maxLength: 64,
        description: "Image size; empty links the original",
      },
      origin: ORIGIN_INPUT,
    },
    required: ["assetId", "name"],
  },
  outputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      url: { type: "string", description: "`origin` + `path`" },
    },
  },
  evaluate(value) {
    const { assetId, name, preset, origin } = parseData(
      "media.delivery-url",
      input,
      value,
    );
    const segments = [assetId, preset, encodeURIComponent(name)];
    const path = `/media/${segments.filter(Boolean).join("/")}`;
    return { path, url: `${origin}${path}` };
  },
};
