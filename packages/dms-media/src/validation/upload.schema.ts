import { z } from "zod";

const MAX_NAME_LENGTH = 255;
const MAX_NAMES_PER_CHECK = 500;

export const uploadNamesSchema = z.object({
  folderId: z.string().min(1),
  filenames: z
    .array(z.string().trim().min(1).max(MAX_NAME_LENGTH))
    .min(1)
    .max(MAX_NAMES_PER_CHECK),
});

export const abortUploadSchema = z.object({
  folderId: z.string().min(1),
  resourceKey: z.string().min(1),
});
