const MIMETYPE_PARAMETER_SEPARATOR = ";";
const FALLBACK_MIMETYPE = "application/octet-stream";
const SANDBOX_POLICY = "sandbox";
const PRINTABLE_ASCII = /^[\x20-\x7e]$/;
const QUOTED_STRING_SPECIALS = new Set(['"', "\\"]);
const ASCII_REPLACEMENT = "_";
const COMBINING_MARKS = /\p{Mn}/gu;

type Disposition = "inline" | "attachment";

/**
 * Types a browser would run as a page from the API origin. SVG stays inline
 * (it is an image) but sandboxed; documents are only ever downloaded.
 */
const ACTIVE_CONTENT_DISPOSITIONS: Record<string, Disposition> = {
  "image/svg+xml": "inline",
  "text/html": "attachment",
  "application/xhtml+xml": "attachment",
  "text/xml": "attachment",
  "application/xml": "attachment",
};

export function normalizedMimetype(mimetype: string): string {
  const essence = mimetype
    .split(MIMETYPE_PARAMETER_SEPARATOR)[0]
    ?.trim()
    .toLowerCase();
  return essence || FALLBACK_MIMETYPE;
}

export function isActiveContent(mimetype: string): boolean {
  return Object.hasOwn(
    ACTIVE_CONTENT_DISPOSITIONS,
    normalizedMimetype(mimetype),
  );
}

function asciiFilename(filename: string): string {
  return Array.from(filename.normalize("NFKD").replace(COMBINING_MARKS, ""))
    .map((character) =>
      PRINTABLE_ASCII.test(character) && !QUOTED_STRING_SPECIALS.has(character)
        ? character
        : ASCII_REPLACEMENT,
    )
    .join("");
}

export function contentDisposition(mimetype: string, filename: string): string {
  const disposition =
    ACTIVE_CONTENT_DISPOSITIONS[normalizedMimetype(mimetype)] ?? "inline";
  const extended = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${asciiFilename(filename)}"; filename*=UTF-8''${extended}`;
}

/** Scripts inside an active file never run with the API origin's privileges. */
export function contentSecurityPolicy(mimetype: string): string | undefined {
  return isActiveContent(mimetype) ? SANDBOX_POLICY : undefined;
}
