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

export interface ImageProbe {
  width?: number;
  height?: number;
  format?: string;
  isReadable: boolean;
}

/** Displayed size: sharp reports stored pixels, EXIF orientations 5-8 swap them. */
function orientedSize(metadata: sharp.Metadata): ImageProbe {
  const isSwapped = (metadata.orientation ?? 0) >= FIRST_SWAPPED_ORIENTATION;
  return {
    width: isSwapped ? metadata.height : metadata.width,
    height: isSwapped ? metadata.width : metadata.height,
    format: metadata.format,
    isReadable: true,
  };
}

/** Reads an image's displayed size; any other file is readable as is. */
export async function probeImageBytes(
  read: () => Promise<Buffer | undefined>,
  mimetype: string,
  size: number,
): Promise<ImageProbe> {
  if (!mimetype.startsWith("image/") || size > MAX_PROBE_SIZE_BYTES)
    return { isReadable: true };
  try {
    const buffer = await read();
    if (!buffer) return { isReadable: true };
    return orientedSize(await sharp(buffer).metadata());
  } catch {
    return { isReadable: false };
  }
}

/** A file declared as a raster type sharp decodes must actually decode. */
export function assertReadableImage(probe: ImageProbe, mimetype: string): void {
  const isDecodable = Boolean(expectedImageFormat(mimetype));
  if (isDecodable && (!probe.isReadable || !probe.format))
    throw new UploadRefusedError(
      HTTP_UNPROCESSABLE_ENTITY,
      "invalid_image",
      "This file is not a readable image",
    );
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
