import { GetMetadata } from "@antelopejs/interface-core";
import { PageMetadata } from "@antelopejs/interface-dms/page";
import { CONTENT_ROOT_BINDING, getRegisteredBindings } from "../bindings";

/** What a linked folder is linked to, in words a reader understands. */
export interface FolderLinkDto {
  /** The `Content` folder that holds every linked folder. */
  isContentRoot: boolean;
  /** Display name of the page the folder serves, an i18n `$key` or plain text. */
  pageTitle: string | null;
  /** Dashboard route of that page. */
  pageUrl: string | null;
}

function describeLinkedPage(bindingId: string): FolderLinkDto {
  const config = getRegisteredBindings().find(
    (entry) => entry.id === bindingId,
  );
  const page = config?.permissionsFromPage
    ? GetMetadata(config.permissionsFromPage, PageMetadata).pageInfo
    : undefined;
  return {
    isContentRoot: false,
    pageTitle: page?.displayName ?? null,
    pageUrl: page?.fullSlug ?? null,
  };
}

/** Mimetype patterns the field bound to a folder accepts, or null when it takes any file. */
export function bindingAccepts(bindingId: string | undefined): string[] | null {
  if (!bindingId) return null;
  const mimetypes = getRegisteredBindings().find(
    (entry) => entry.id === bindingId,
  )?.field?.mimetypes;
  return mimetypes && mimetypes.length > 0 ? [...mimetypes] : null;
}

export function describeFolderLink(
  bindingId: string | undefined,
): FolderLinkDto | null {
  if (!bindingId) return null;
  if (bindingId === CONTENT_ROOT_BINDING)
    return { isContentRoot: true, pageTitle: null, pageUrl: null };
  return describeLinkedPage(bindingId);
}
