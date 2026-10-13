import { getMediaConfig } from "./config";

const WILDCARD = "*";
const PARAMETER_SEPARATOR = ";";
const EXTENSION_SEPARATOR = ".";

/** Active documents a browser would run from the library origin. */
const REFUSED_MIMETYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "application/x-httpd-php",
]);
const REFUSED_EXTENSIONS = new Set([
  "htm",
  "html",
  "xhtml",
  "xht",
  "shtml",
  "mht",
  "mhtml",
]);

/** Image formats sharp decodes: a file declared as one of them must decode. */
const DECODABLE_IMAGE_MIMETYPES: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "heif",
  "image/tiff": "tiff",
};

/** Mimetype of what sharp actually read, to store instead of the claim. */
const MIMETYPES_BY_FORMAT: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  tiff: "image/tiff",
};

export function normalizeMimetype(mimetype: string): string {
  return (mimetype.split(PARAMETER_SEPARATOR)[0] ?? "").trim().toLowerCase();
}

function matchesPattern(mimetype: string, pattern: string): boolean {
  const normalized = normalizeMimetype(pattern);
  if (!normalized.endsWith(WILDCARD)) return mimetype === normalized;
  return mimetype.startsWith(normalized.slice(0, -WILDCARD.length));
}

/** Whether `mimetype` is one of `patterns` (`image/*` matches a prefix). */
export function mimetypeMatches(
  mimetype: string,
  patterns: readonly string[],
): boolean {
  const normalized = normalizeMimetype(mimetype);
  return patterns.some((pattern) => matchesPattern(normalized, pattern));
}

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(EXTENSION_SEPARATOR);
  return index < 0 ? "" : filename.slice(index + 1).toLowerCase();
}

/** The library's own rule: configured types only, active documents never. */
export function isUploadTypeAllowed(
  filename: string,
  mimetype: string,
): boolean {
  if (REFUSED_EXTENSIONS.has(extensionOf(filename))) return false;
  if (REFUSED_MIMETYPES.has(normalizeMimetype(mimetype))) return false;
  return mimetypeMatches(mimetype, getMediaConfig().allowedMimetypes);
}

/** sharp's format name for a declared image type it must be able to decode. */
export function expectedImageFormat(mimetype: string): string | undefined {
  return DECODABLE_IMAGE_MIMETYPES[normalizeMimetype(mimetype)];
}

export function mimetypeOfFormat(
  format: string | undefined,
): string | undefined {
  return format ? MIMETYPES_BY_FORMAT[format] : undefined;
}
