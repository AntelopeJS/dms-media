import sharp from "sharp";
import { getRegisteredBindings } from "./bindings";
import { getMediaConfig } from "./config";
import type { MediaAssetModel } from "./db";
import { sumStoredBytes } from "./library/listing";
import {
  expectedImageFormat,
  isUploadTypeAllowed,
  mimetypeMatches,
} from "./upload-policy";

const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const FIRST_SWAPPED_ORIENTATION = 5;
/**
 * Dimension probing buffers the file in memory, so files too large to hold in
 * the heap are skipped; they simply stay without width/height metadata.
 */
const MAX_PROBE_SIZE_BYTES = 32 * 1024 * 1024;

/** Why an upload is refused, for the queue to explain it in the member's language. */
export type UploadRefusal =
  | "type_not_allowed"
  | "field_type"
  | "quota"
  | "invalid_image";

/** What a refusal tells the member besides its reason: the accepted types of the field, or the quota left. */
interface UploadRefusalDetails {
  accepted?: string[];
  remaining?: number;
  quota?: number;
}

/**
 * A file the library refuses, whoever adds it: the upload routes answer it as
 * an HTTP error, declared content throws it to the calling module.
 */
export class UploadRefusedError extends Error {
  constructor(
    readonly status: number,
    readonly reason: UploadRefusal,
    message: string,
    readonly details: UploadRefusalDetails = {},
  ) {
    super(message);
  }
}

/** An image's displayed size and decoded format, each absent when unknown. */
export interface ImageProbe {
  width?: number;
  height?: number;
  format?: string;
}

/** Displayed size: sharp reports stored pixels, EXIF orientations 5-8 swap them. */
function orientedSize(metadata: sharp.Metadata): ImageProbe {
  const isSwapped = (metadata.orientation ?? 0) >= FIRST_SWAPPED_ORIENTATION;
  return {
    width: isSwapped ? metadata.height : metadata.width,
    height: isSwapped ? metadata.width : metadata.height,
    format: metadata.format,
  };
}

async function readMetadata(
  read: () => Promise<Buffer>,
): Promise<sharp.Metadata | undefined> {
  try {
    return await sharp(await read()).metadata();
  } catch {
    return undefined;
  }
}

/**
 * Reads an image's displayed size. A file declared as a raster type sharp
 * decodes must decode; any other file, and an image too large to probe, has
 * no size.
 */
export async function probeImage(
  read: () => Promise<Buffer>,
  mimetype: string,
  size: number,
): Promise<ImageProbe> {
  if (!mimetypeMatches(mimetype, ["image/*"]) || size > MAX_PROBE_SIZE_BYTES)
    return {};
  const metadata = await readMetadata(read);
  if (metadata?.format) return orientedSize(metadata);
  if (expectedImageFormat(mimetype))
    throw new UploadRefusedError(
      HTTP_UNPROCESSABLE_ENTITY,
      "invalid_image",
      "This file is not a readable image",
    );
  return {};
}

/** The library's types, then those of the asset field the folder feeds. */
export function assertUploadTypeAllowed(
  bindingId: string | undefined,
  filename: string,
  mimetype: string,
): void {
  if (!isUploadTypeAllowed(filename, mimetype))
    throw new UploadRefusedError(
      HTTP_UNSUPPORTED_MEDIA_TYPE,
      "type_not_allowed",
      "This type of file can't be added to the library",
    );
  const accepted = getRegisteredBindings().find(
    (config) => config.id === bindingId,
  )?.field?.mimetypes;
  if (accepted?.length && !mimetypeMatches(mimetype, accepted))
    throw new UploadRefusedError(
      HTTP_UNSUPPORTED_MEDIA_TYPE,
      "field_type",
      `This folder feeds a field that only accepts ${accepted.join(", ")}`,
      { accepted },
    );
}

export async function assertWithinQuota(
  assetModel: MediaAssetModel,
  size: number,
): Promise<void> {
  const quota = getMediaConfig().storageQuotaBytes;
  if (!quota) return;
  const used = await sumStoredBytes(assetModel);
  if (used + size > quota)
    throw new UploadRefusedError(
      HTTP_PAYLOAD_TOO_LARGE,
      "quota",
      "The library's storage plan is full",
      { remaining: Math.max(quota - used, 0), quota },
    );
}
