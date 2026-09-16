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
 * Public delivery bounds how long a flip back to private takes to revoke
 * access: the signed URL and the CDN cache both expire within this window,
 * trading some CDN reuse for timely revocation.
 */
export const PUBLIC_READ_URL_TTL_SECONDS = SECONDS_PER_HOUR;
export const PRIVATE_CACHE_CONTROL = "no-store";
export const PUBLIC_CACHE_CONTROL = `public, max-age=${SECONDS_PER_HOUR}`;
