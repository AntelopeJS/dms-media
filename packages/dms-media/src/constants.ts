export const MEDIA_UPLOAD_PERMISSION = "media.upload";
export const MEDIA_FOLDERS_MANAGE_PERMISSION = "media.folders.manage";
export const MEDIA_PERMISSIONS_MANAGE_PERMISSION = "media.permissions.manage";

/**
 * Permissions 0.2 offered in the roles editor. Media pages are owner-only, so
 * they are no longer registered, and a role still holding one grants a member
 * nothing: an ACL entry or a check naming them only ever matches owners.
 */
export const RETIRED_MEDIA_PERMISSIONS: readonly string[] = [
  MEDIA_UPLOAD_PERMISSION,
  MEDIA_FOLDERS_MANAGE_PERMISSION,
  MEDIA_PERMISSIONS_MANAGE_PERMISSION,
];

export const OWNER_WILDCARD_PERMISSION = "*";

export const ORIGINAL_FILENAME_METADATA_KEY = "original-filename";

/** Realtime topic the library publishes on after each write, for the blocks showing it. */
export const MEDIA_LIBRARY_TOPIC = "media.library";
