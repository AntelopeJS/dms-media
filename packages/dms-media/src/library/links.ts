/** Dashboard routes of the media pages, for links served by the API. */
export const MEDIA_ROUTES = {
  overview: "/media/overview",
  files: "/media/files",
  file: "/media/file",
  editor: "/media/editor",
  uploads: "/media/uploads",
  access: "/media/access",
  linked: "/media/linked",
  presets: "/media/presets",
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

export function accessLink(folderId: string): string {
  return `${MEDIA_ROUTES.access}?folder=${encodeURIComponent(folderId)}`;
}
