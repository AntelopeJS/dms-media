import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { MediaAsset } from "../../db";
import type { MediaRequestContext } from "../../routes/media/context";
import {
  copyName,
  requireEditableAsset,
  transformAsCopy,
  transformInPlace,
} from "../../services/transform";
import { cropToPixels, type ImageTransformOps } from "../../transform";
import { transformSchema } from "../../validation/media.schema";
import {
  ASSET_ID_INPUT,
  assetIdField,
  objectSchema,
  requireFile,
  TENANT_INPUT,
  tenantIdField,
  writeAction,
} from "./support";

const ROTATIONS = [0, 90, 180, 270] as const;
const HALF_TURN = 180;
const ratio = z.number().min(0).max(1).optional();

const input = z
  .object({
    tenantId: tenantIdField,
    assetId: assetIdField,
    cropX: ratio,
    cropY: ratio,
    cropWidth: ratio,
    cropHeight: ratio,
    rotate: z
      .number()
      .refine((value) => ROTATIONS.some((rotation) => rotation === value), {
        message: "rotate must be 0, 90, 180 or 270",
      })
      .default(0),
    asCopy: z.boolean().default(true),
  })
  .transform((value, ctx) => {
    const crop = [value.cropX, value.cropY, value.cropWidth, value.cropHeight];
    const given = crop.filter((part) => part !== undefined).length;
    if (given !== 0 && given !== crop.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "give all four crop ports or none",
      });
      return z.NEVER;
    }
    const ops = transformSchema.safeParse({
      crop:
        given === 0
          ? undefined
          : {
              x: value.cropX,
              y: value.cropY,
              width: value.cropWidth,
              height: value.cropHeight,
            },
      rotate: value.rotate === 0 ? undefined : value.rotate,
    });
    if (!ops.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: ops.error.issues[0]?.message ?? "invalid operations",
      });
      return z.NEVER;
    }
    return {
      tenantId: value.tenantId,
      assetId: value.assetId,
      asCopy: value.asCopy,
      ops: ops.data,
    };
  });

interface TransformPlan {
  asset: MediaAsset;
  ops: ImageTransformOps;
  asCopy: boolean;
  name: string;
}

interface TransformResult {
  assetId: string;
  name: string;
  mimetype: string;
  width: number;
  height: number;
  size: number;
}

/** The displayed size the edit gives, from the stored size: what a test run reports. */
function editedSize(asset: MediaAsset, ops: ImageTransformOps) {
  const width = asset.width ?? 0;
  const height = asset.height ?? 0;
  const turned = (ops.rotate ?? 0) % HALF_TURN !== 0;
  const rotated = turned ? { width: height, height: width } : { width, height };
  if (!ops.crop || rotated.width === 0 || rotated.height === 0) return rotated;
  const region = cropToPixels(ops.crop, rotated);
  return { width: region.width, height: region.height };
}

function outputOf(plan: TransformPlan, result: TransformResult) {
  return {
    ...result,
    sourceAssetId: plan.asset._id,
    asCopy: plan.asCopy,
  };
}

async function planOf(
  context: MediaRequestContext,
  value: { assetId: string; asCopy: boolean; ops: ImageTransformOps },
): Promise<TransformPlan> {
  await requireFile(context, value.assetId);
  const asset = await requireEditableAsset(context, value.assetId);
  const name = value.asCopy ? await copyName(context, asset) : asset.name;
  return { asset, ops: value.ops, asCopy: value.asCopy, name };
}

export const transformImageAction = writeAction({
  id: "media.transform-image",
  name: "Crop or rotate image",
  description:
    "Crops and/or rotates a JPEG, PNG, WebP or AVIF image, as an edited copy or in place (the original stays restorable).",
  icon: "i-lucide-crop",
  inputSchema: objectSchema(
    {
      tenantId: TENANT_INPUT,
      assetId: { ...ASSET_ID_INPUT, description: "Source image" },
      cropX: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description:
          "Left edge of the crop, as a fraction of the displayed width. Give all four crop ports or none.",
      },
      cropY: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description:
          "Top edge of the crop, as a fraction of the displayed height.",
      },
      cropWidth: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description:
          "Crop width, as a fraction; `cropX + cropWidth` at most 1.",
      },
      cropHeight: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description:
          "Crop height, as a fraction; `cropY + cropHeight` at most 1.",
      },
      rotate: {
        type: "number",
        enum: [...ROTATIONS],
        default: 0,
        description: "Clockwise rotation in degrees, applied before the crop.",
      },
      asCopy: {
        type: "boolean",
        default: true,
        description:
          "Create an edited copy next to the source. Off edits the file in place, keeping its original restorable.",
      },
    },
    ["assetId"],
  ),
  outputSchema: objectSchema({
    assetId: {
      type: "string",
      description: "The copy, or the source when edited in place",
    },
    sourceAssetId: { type: "string" },
    asCopy: { type: "boolean" },
    name: { type: "string" },
    mimetype: { type: "string" },
    width: { type: "number" },
    height: { type: "number" },
    size: { type: "number", description: "Bytes" },
  }),
  input,
  plan: (context, value) => planOf(context, value),
  async apply(context, plan) {
    const edited = plan.asCopy
      ? await transformAsCopy(context, plan.asset, plan.ops, "automation")
      : await transformInPlace(context, plan.asset, plan.ops);
    return outputOf(plan, {
      assetId: edited._id,
      name: edited.name,
      mimetype: edited.mimetype,
      width: edited.width ?? 0,
      height: edited.height ?? 0,
      size: edited.size,
    });
  },
  simulate(plan) {
    return outputOf(plan, {
      assetId: plan.asCopy ? randomUUID() : plan.asset._id,
      name: plan.name,
      mimetype: plan.asset.mimetype,
      ...editedSize(plan.asset, plan.ops),
      size: plan.asset.size,
    });
  },
  skipped: (plan) =>
    `${plan.asCopy ? "edited copy" : "in-place edit"} of image ${plan.asset._id}; size is the source's, as an estimate`,
});
