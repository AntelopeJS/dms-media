export interface FileTypeInfo {
  label: string;
  icon: string;
}

export const MIME_TYPES: Record<string, FileTypeInfo> = {
  // Pdf documents
  "application/pdf": { label: "pdf", icon: "i-ph-file-pdf" },
  // Office documents
  "application/msword": { label: "doc", icon: "i-ph-file-doc" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    label: "doc",
    icon: "i-ph-file-doc",
  },
  "application/vnd.ms-excel": { label: "xls", icon: "i-ph-file-xls" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    label: "xls",
    icon: "i-ph-file-xls",
  },
  "application/vnd.ms-powerpoint": {
    label: "ppt",
    icon: "i-ph-file-ppt",
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    label: "ppt",
    icon: "i-ph-file-ppt",
  },
  // Images
  "image/png": { label: "png", icon: "i-ph-file-png" },
  "image/jpeg": { label: "jpg", icon: "i-ph-file-jpg" },
  "image/gif": { label: "gif", icon: "i-ph-file-image" },
  "image/webp": { label: "webp", icon: "i-ph-file-image" },
  "image/svg+xml": { label: "svg", icon: "i-ph-file-svg" },
  // Videos
  "video/mp4": { label: "mp4", icon: "i-ph-file-video" },
  "video/webm": { label: "webm", icon: "i-ph-file-video" },
  "video/quicktime": { label: "mov", icon: "i-ph-file-video" },
  // Audio files
  "audio/mpeg": { label: "mp3", icon: "i-ph-file-audio" },
  "audio/wav": { label: "wav", icon: "i-ph-file-audio" },
  "audio/ogg": { label: "ogg", icon: "i-ph-file-audio" },
  // Archives
  "application/zip": { label: "zip", icon: "i-ph-file-zip" },
  "application/x-rar-compressed": { label: "rar", icon: "i-ph-file-zip" },
  "application/x-7z-compressed": { label: "7z", icon: "i-ph-file-zip" },
  // Code
  "text/html": { label: "html", icon: "i-ph-file-html" },
  "text/css": { label: "css", icon: "i-ph-file-css" },
  "text/javascript": { label: "js", icon: "i-ph-file-js" },
  "application/javascript": { label: "js", icon: "i-ph-file-js" },
  "application/typescript": { label: "ts", icon: "i-ph-file-ts" },
  "application/json": { label: "json", icon: "i-ph-file-code" },
  // Texte
  "text/plain": { label: "txt", icon: "i-ph-file-text" },
  "text/csv": { label: "csv", icon: "i-ph-file-csv" },
  // Executables
  "application/x-msdownload": { label: "exe", icon: "i-ph-file" },
  "application/octet-stream": { label: "file", icon: "i-ph-file" },
};

export const PREVIEWABLE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
];

/**
 * Formats for which image editing is offered in the UI.
 *
 * Mirror of `EDITABLE_IMAGE_MIMETYPES` in `src/routes/media/delivery.ts`
 * (the backend 422 guard): this layer is copied by ajs dms at prepare time
 * and cannot resolve imports into the backend `src/` tree, so keep both
 * lists in sync when adding a format.
 */
export const EDITABLE_IMAGE_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export function isEditableImageMimetype(mimetype: string): boolean {
  return EDITABLE_IMAGE_MIMETYPES.has(mimetype);
}

const DEFAULT_ICON = "i-ph-file";
const DEFAULT_TYPE_KEY = "dms.finder.file_type.default";

function getFileTypeInfo(mimetype: string): FileTypeInfo | undefined {
  return MIME_TYPES[mimetype];
}

export function getExtensionIcon(mimetype: string): string {
  return getFileTypeInfo(mimetype)?.icon ?? DEFAULT_ICON;
}

export function getExtensionLabel(
  mimetype: string,
  t?: (key: string) => string,
): string {
  const info = getFileTypeInfo(mimetype);
  if (info) return info.label;
  return t ? t(DEFAULT_TYPE_KEY) : "file";
}
