const MEDIA_MODULE_URL = "/modules/media";

/** Dashboard routes of the media pages, for links served by the API. */
export const MEDIA_ROUTES = {
  overview: `${MEDIA_MODULE_URL}/overview`,
  activity: `${MEDIA_MODULE_URL}/activity`,
  files: `${MEDIA_MODULE_URL}/files`,
  file: `${MEDIA_MODULE_URL}/file`,
  editor: `${MEDIA_MODULE_URL}/editor`,
  uploads: `${MEDIA_MODULE_URL}/uploads`,
  presets: `${MEDIA_MODULE_URL}/presets`,
} as const;

export function folderLink(folderId: string): string {
  return `${MEDIA_ROUTES.files}?folder=${encodeURIComponent(folderId)}`;
}

export function fileLink(assetId: string): string {
  return `${MEDIA_ROUTES.file}?asset=${encodeURIComponent(assetId)}`;
}

export function viewLink(view: string): string {
  return `${MEDIA_ROUTES.files}?view=${encodeURIComponent(view)}`;
}
