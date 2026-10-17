import { assertValidation } from "@antelopejs/interface-api-util";
import { z, ZodError } from "zod";

const MAX_NAME_LENGTH = 255;
const MIN_PRINTABLE_CHAR_CODE = 32;
const PATH_SEPARATORS = new Set(["/", "\\"]);
const NON_PORTABLE_CHARS = new Set(["<", ">", ":", '"', "|", "?", "*"]);
const ERRORS = "$dms_media.errors";

/** Error bodies the API answers with: i18n keys the dashboard translates. */
export const MEDIA_ERRORS = {
  invalidRequest: `${ERRORS}.invalid_request`,
  assetNotFound: `${ERRORS}.asset_not_found`,
  nameRequired: `${ERRORS}.name_required`,
  nameTooLong: `${ERRORS}.name_too_long`,
  nameForbidden: `${ERRORS}.name_forbidden`,
  nameTaken: `${ERRORS}.name_taken`,
  folderNameTaken: `${ERRORS}.folder_name_taken`,
  boundParent: `${ERRORS}.bound_parent`,
  altTooLong: `${ERRORS}.alt_too_long`,
} as const;

function isPrintable(char: string): boolean {
  return char.charCodeAt(0) >= MIN_PRINTABLE_CHAR_CODE;
}

function isSafeFileName(value: string): boolean {
  return Array.from(value).every(
    (char) => !PATH_SEPARATORS.has(char) && isPrintable(char),
  );
}

function isPortableName(value: string): boolean {
  return (
    isSafeFileName(value) &&
    Array.from(value).every((char) => !NON_PORTABLE_CHARS.has(char))
  );
}

function boundedName(): z.ZodString {
  return z
    .string()
    .trim()
    .min(1, { message: MEDIA_ERRORS.nameRequired })
    .max(MAX_NAME_LENGTH, { message: MEDIA_ERRORS.nameTooLong });
}

/** A name typed in the library: refuses what Windows or macOS can't save. */
export const nameSchema = boundedName().refine(isPortableName, {
  message: MEDIA_ERRORS.nameForbidden,
});

/** The name of an uploaded file, kept as the computer sent it. */
export const fileNameSchema = boundedName().refine(isSafeFileName, {
  message: MEDIA_ERRORS.nameForbidden,
});

/** Two names clash when this form of theirs is equal: case and Unicode form aside. */
export function comparableName(name: string): string {
  return name.trim().normalize("NFC").toLocaleLowerCase();
}

/** The first validation message when it is an i18n key, a generic one otherwise. */
export function describeValidationError(error: unknown): string {
  const message = error instanceof ZodError ? error.issues[0]?.message : "";
  return message?.startsWith("$") ? message : MEDIA_ERRORS.invalidRequest;
}

/** Parses a request body, answering 400 with a translatable message. */
export function parseBody<Schema extends z.ZodTypeAny>(
  body: unknown,
  schema: Schema,
): z.output<Schema> {
  return assertValidation(
    body,
    (value) => schema.parse(value) as z.output<Schema>,
    describeValidationError,
  );
}

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

export const MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024;

export const presignSchema = z.object({
  folderId: z.string().min(1),
  filename: fileNameSchema,
  size: z.number().int().positive().max(MAX_UPLOAD_SIZE_BYTES),
  mimetype: z.string().min(1),
});

export const confirmUploadSchema = z.object({
  folderId: z.string().min(1),
  resourceKey: z.string().min(1),
  filename: fileNameSchema,
  batchId: z.string().min(1).max(MAX_NAME_LENGTH).optional(),
});

export const altSchema = z
  .string()
  .max(MAX_NAME_LENGTH, { message: MEDIA_ERRORS.altTooLong });

export const updateAssetSchema = z.object({
  name: nameSchema.optional(),
  alt: altSchema.optional(),
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
