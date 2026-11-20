export const OWNER_WILDCARD_PERMISSION = "*";

export const ORIGINAL_FILENAME_METADATA_KEY = "original-filename";

/** Realtime topic the library publishes on after each write, for the blocks showing it. */
export const MEDIA_LIBRARY_TOPIC = "media.library";

/**
 * Formats accepted by the transform pipeline. Sharp would silently
 * rasterize or flatten anything else (SVG, animated sources).
 *
 * Mirrored in `frontend-vue/app/utils/mediaFiles.ts` for the UI
 * affordances: the frontend module is copied by ajs dms at prepare time and
 * cannot resolve imports into the backend `src/` tree, so keep both
 * lists in sync when adding a format.
 */
export const EDITABLE_IMAGE_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
