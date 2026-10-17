import { z, ZodError } from "zod";
import {
  altSchema,
  fileNameSchema,
  MAX_UPLOAD_SIZE_BYTES,
  MEDIA_ERRORS,
  nameSchema,
} from "./media.schema";

/**
 * The dashboard answers with i18n keys its pages translate; a module declaring
 * content reads the error in its logs, so it gets the English text.
 */
const DECLARATION_ERROR_TEXTS: Record<string, string> = {
  [MEDIA_ERRORS.nameRequired]: "a name is required",
  [MEDIA_ERRORS.nameTooLong]: "the name is limited to 255 characters",
  [MEDIA_ERRORS.nameForbidden]:
    "a name can't contain / \\ < > : \" | ? * or control characters",
  [MEDIA_ERRORS.altTooLong]: "the alt text is limited to 255 characters",
};

const keySchema = z.string().trim().min(1).max(255);
const tenantSchema = z.string().trim().min(1);

const aclEntrySchema = z.object({
  subject: z.object({
    kind: z.enum(["permission", "role"]),
    id: z.string().min(1),
  }),
  rights: z.array(z.enum(["read", "write", "manage"])).min(1),
});

export const declaredFolderSchema = z.object({
  key: keySchema,
  name: nameSchema,
  parent: keySchema.optional(),
  visibility: z.enum(["private", "public"]).default("private"),
  acl: z.array(aclEntrySchema).optional(),
  tenantId: tenantSchema,
});

const folderTargetSchema = z.union([
  z.object({ key: keySchema }).strict(),
  z.object({ binding: keySchema }).strict(),
]);

const sourceSchema = z.union([
  z.object({ bytes: z.instanceof(Uint8Array) }).strict(),
  z.object({ filePath: z.string().min(1) }).strict(),
  // Checked as a function only: wrapping it in z.function() would replace the caller's loader.
  z
    .object({
      load: z.custom<() => Uint8Array | Promise<Uint8Array>>(
        (value) => typeof value === "function",
        { message: "load must be a function" },
      ),
    })
    .strict(),
]);

export const declaredAssetSchema = z.object({
  key: keySchema,
  folder: folderTargetSchema,
  name: fileNameSchema,
  mimetype: z.string().trim().min(1),
  source: sourceSchema,
  version: keySchema.optional(),
  alt: altSchema.optional(),
  tenantId: tenantSchema,
});

export type DeclaredFolderInput = z.output<typeof declaredFolderSchema>;
export type DeclaredAssetInput = z.output<typeof declaredAssetSchema>;

/** Size limits of an uploaded file, checked once the source is read. */
export const declaredFileSizeSchema = z
  .number()
  .int()
  .positive({ message: "the file is empty" })
  .max(MAX_UPLOAD_SIZE_BYTES, {
    message: `the file exceeds ${MAX_UPLOAD_SIZE_BYTES} bytes`,
  });

/** Every validation issue of a declaration, as `field: reason`. */
export function describeDeclarationIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.join(".") || "declaration";
      return `${field}: ${DECLARATION_ERROR_TEXTS[issue.message] ?? issue.message}`;
    })
    .join("; ");
}
