import { z } from "zod";
import { getMediaConfig } from "../../config";
import { resolveEffectiveVisibility } from "../../routes/media/dto";
import { createFileReadUrl } from "../../services/reads";
import {
  ASSET_ID_INPUT,
  assetIdField,
  objectSchema,
  readAction,
  requireFile,
  TENANT_INPUT,
  tenantIdField,
} from "./support";

const MIN_TTL_SECONDS = 60;
const DEFAULT_TTL_SECONDS = 3600;

const input = z
  .object({
    tenantId: tenantIdField,
    assetId: assetIdField,
    preset: z
      .string()
      .trim()
      .max(64)
      .optional()
      .transform((value) => value || undefined),
    expiresInSeconds: z
      .number()
      .int()
      .min(MIN_TTL_SECONDS)
      .default(DEFAULT_TTL_SECONDS),
  })
  .superRefine((value, ctx) => {
    const ceiling = getMediaConfig().readUrlMaxTtlSeconds;
    if (value.expiresInSeconds > ceiling)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expiresInSeconds"],
        message: `at most ${ceiling} seconds`,
      });
  });

export const createReadUrlAction = readAction({
  id: "media.create-read-url",
  name: "Create download link",
  description:
    "Creates a signed link to a file (or one of its image sizes) that anyone can open until it expires.",
  icon: "i-lucide-link",
  inputSchema: objectSchema(
    {
      tenantId: TENANT_INPUT,
      assetId: ASSET_ID_INPUT,
      preset: {
        type: "string",
        maxLength: 64,
        description:
          "Image size to link instead of the original (images only). Required for SVG and XML files.",
      },
      expiresInSeconds: {
        type: "integer",
        minimum: MIN_TTL_SECONDS,
        default: DEFAULT_TTL_SECONDS,
        description:
          "Lifetime of the link; at most the module's `automation.readUrlMaxTtlSeconds` (7 days by default)",
      },
    },
    ["assetId"],
  ),
  outputSchema: objectSchema({
    url: {
      type: "string",
      description: "Anyone holding it can read the file until it expires",
    },
    expiresAt: {
      type: ["string", "null"],
      description: "Null when the storage serves the file without expiry",
    },
    name: { type: "string" },
    mimetype: { type: "string" },
    size: { type: "number" },
    effectiveVisibility: { type: "string", enum: ["private", "public"] },
  }),
  input,
  async read(context, value) {
    const asset = await requireFile(context, value.assetId);
    const link = await createFileReadUrl(
      context,
      asset,
      value.preset,
      value.expiresInSeconds,
    );
    return {
      ...link,
      name: asset.name,
      mimetype: asset.mimetype,
      size: asset.size,
      effectiveVisibility: resolveEffectiveVisibility(
        asset,
        context.foldersById.get(asset.folderId),
      ),
    };
  },
});
