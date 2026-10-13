const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;

export const PRIVATE_READ_URL_TTL_SECONDS = 5 * SECONDS_PER_MINUTE;
/**
 * Thumbnails/previews are re-hydrated per session and must outlive an idle
 * Finder window, so they get a longer signed lifetime than one-shot reads.
 */
export const PREVIEW_URL_TTL_SECONDS = 12 * SECONDS_PER_HOUR;
/**
 * Lifetime of the signed URL a public delivery redirects to. The same URL is
 * handed out for half of it, so repeated reads neither mint a token each
 * time nor change the address a browser or CDN caches the bytes under.
 */
export const PUBLIC_READ_URL_TTL_SECONDS = SECONDS_PER_HOUR;
/**
 * The stable `/media/...` link itself is never reused without asking: an
 * edit, a replacement or a flip back to private shows on the next request.
 */
export const PUBLIC_CACHE_MAX_AGE_SECONDS = 0;
export const PUBLIC_REDIRECT_CACHE_CONTROL = "no-cache";
export const PRIVATE_REDIRECT_CACHE_CONTROL = "no-store";
/** Active content served directly (SVG), revalidated against its ETag on every use. */
export const PUBLIC_CACHE_CONTROL = "public, no-cache";
export const PRIVATE_CACHE_CONTROL = "private, no-cache";
