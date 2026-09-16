import { z } from "zod";

const MAX_NAME_LENGTH = 255;
const MIN_PRINTABLE_CHAR_CODE = 32;
const FORBIDDEN_NAME_CHARS = new Set(["/", "\\"]);

function isSafeName(value: string): boolean {
  return Array.from(value).every(
    (char) =>
      !FORBIDDEN_NAME_CHARS.has(char) &&
      char.charCodeAt(0) >= MIN_PRINTABLE_CHAR_CODE,
  );
}

const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_NAME_LENGTH)
  .refine(isSafeName, {
    message: "Name contains forbidden characters",
  });

const aclRightSchema = z.enum(["read", "write", "manage"]);

const aclSubjectSchema = z.object({
  kind: z.enum(["permission", "role"]),
  id: z.string().min(1),
});

export const aclEntrySchema = z.object({
  subject: aclSubjectSchema,
  rights: z.array(aclRightSchema).min(1),
});

export const createFolderSchema = z.object({
  name: nameSchema,
  parentId: z.string().min(1).optional(),
});

export const renameFolderSchema = z.object({
  name: nameSchema,
});

export const moveFolderSchema = z.object({
  parentId: z.string().min(1).nullable(),
});

export const folderVisibilitySchema = z.object({
  visibility: z.enum(["private", "public"]),
});

export const folderAclSchema = z.object({
  entries: z.array(aclEntrySchema).nullable(),
});

const MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024;

export const presignSchema = z.object({
  folderId: z.string().min(1),
  filename: nameSchema,
  size: z.number().int().positive().max(MAX_UPLOAD_SIZE_BYTES),
  mimetype: z.string().min(1),
});

export const confirmUploadSchema = z.object({
  folderId: z.string().min(1),
  resourceKey: z.string().min(1),
  filename: nameSchema,
});

export const updateAssetSchema = z.object({
  name: nameSchema.optional(),
  alt: z.string().max(MAX_NAME_LENGTH).optional(),
});

export const moveAssetSchema = z.object({
  folderId: z.string().min(1),
});

export const assetVisibilitySchema = z.object({
  visibility: z.enum(["inherit", "private", "public"]),
});

const MAX_PREVIEW_BATCH = 200;

export const previewIdsSchema = z.object({
  ids: z.array(z.string().min(1)).max(MAX_PREVIEW_BATCH),
});

const normalizedRatio = z.number().min(0).max(1);
const ALLOWED_ROTATIONS = [90, 180, 270] as const;

const cropSchema = z
  .object({
    x: normalizedRatio,
    y: normalizedRatio,
    width: normalizedRatio.refine((value) => value > 0),
    height: normalizedRatio.refine((value) => value > 0),
  })
  .refine((crop) => crop.x + crop.width <= 1 && crop.y + crop.height <= 1, {
    message: "Crop region exceeds the image bounds",
  });

export const transformSchema = z
  .object({
    crop: cropSchema.optional(),
    rotate: z
      .number()
      .refine((value) =>
        ALLOWED_ROTATIONS.includes(value as (typeof ALLOWED_ROTATIONS)[number]),
      )
      .optional(),
  })
  .refine((ops) => ops.crop !== undefined || ops.rotate !== undefined, {
    message: "At least one transform operation is required",
  });
