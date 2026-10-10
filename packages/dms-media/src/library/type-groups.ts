export const ASSET_TYPE_GROUPS = [
  "image",
  "video",
  "audio",
  "pdf",
  "document",
  "spreadsheet",
  "vector",
  "archive",
  "other",
] as const;

export type AssetTypeGroup = (typeof ASSET_TYPE_GROUPS)[number];

interface TypeGroupRule {
  group: AssetTypeGroup;
  matches: (mimetype: string) => boolean;
}

const SPREADSHEET_MIMETYPES = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
]);

const DOCUMENT_MIMETYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.presentation",
  "application/rtf",
  "text/plain",
  "text/markdown",
]);

const ARCHIVE_MIMETYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/x-tar",
  "application/gzip",
  "application/x-7z-compressed",
  "application/vnd.rar",
]);

const TYPE_GROUP_RULES: TypeGroupRule[] = [
  { group: "vector", matches: (mimetype) => mimetype === "image/svg+xml" },
  { group: "image", matches: (mimetype) => mimetype.startsWith("image/") },
  { group: "video", matches: (mimetype) => mimetype.startsWith("video/") },
  { group: "audio", matches: (mimetype) => mimetype.startsWith("audio/") },
  { group: "pdf", matches: (mimetype) => mimetype === "application/pdf" },
  {
    group: "spreadsheet",
    matches: (mimetype) => SPREADSHEET_MIMETYPES.has(mimetype),
  },
  {
    group: "document",
    matches: (mimetype) => DOCUMENT_MIMETYPES.has(mimetype),
  },
  { group: "archive", matches: (mimetype) => ARCHIVE_MIMETYPES.has(mimetype) },
];

export function resolveTypeGroup(mimetype: string): AssetTypeGroup {
  const normalized = mimetype.toLowerCase();
  return (
    TYPE_GROUP_RULES.find((rule) => rule.matches(normalized))?.group ?? "other"
  );
}

export function isTypeGroup(value: string): value is AssetTypeGroup {
  return (ASSET_TYPE_GROUPS as readonly string[]).includes(value);
}

/** Whether an asset is an image that alt text describes (vectors included). */
export function isDescribableImage(mimetype: string): boolean {
  const group = resolveTypeGroup(mimetype);
  return group === "image" || group === "vector";
}
