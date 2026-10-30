import { z, type ZodType, type ZodTypeDef } from "zod";

/** A response body checked against the shape its route answers. */
export function readBody<Output>(
  response: { data: unknown },
  schema: ZodType<Output, ZodTypeDef, unknown>,
): Output {
  return schema.parse(response.data);
}

/** What creating a folder answers. */
export const createdBody = z.object({ id: z.string() });

/** What presigning an upload answers. */
export const presignBody = z.object({
  uploadUrl: z.string(),
  headers: z.record(z.string()),
  resourceKey: z.string(),
});

/** What a read-url answers. */
export const urlBody = z.object({ url: z.string() });
