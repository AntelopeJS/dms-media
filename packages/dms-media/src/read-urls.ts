import { CreateReadUrl } from "@antelopejs/interface-file-storage";

const MS_PER_SECOND = 1000;
const DEFAULT_TTL_SECONDS = 60 * 60;
const REUSE_FRACTION = 2;
const MAX_CACHED_URLS = 5000;

interface CachedReadUrl {
  url: string;
  reusableUntil: number;
}

const cachedUrls = new Map<string, CachedReadUrl>();

function pruneCachedUrls(now: number): void {
  for (const [key, entry] of cachedUrls) {
    if (entry.reusableUntil <= now || cachedUrls.size > MAX_CACHED_URLS) {
      cachedUrls.delete(key);
    }
  }
}

/**
 * Signed URL of a stored file, handed out again for half its lifetime: every
 * URL given away stays valid for at least that half, and repeated reads
 * neither mint (and persist) a storage token each time nor change address.
 */
export async function signedReadUrl(
  storageKey: string,
  storage: string | undefined,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const cacheKey = `${storage ?? ""}:${ttlSeconds}:${storageKey}`;
  const now = Date.now();
  const cached = cachedUrls.get(cacheKey);
  if (cached && cached.reusableUntil > now) return cached.url;
  const readUrl = await CreateReadUrl(storageKey, ttlSeconds, storage);
  pruneCachedUrls(now);
  cachedUrls.set(cacheKey, {
    url: readUrl.url,
    reusableUntil: now + (ttlSeconds * MS_PER_SECOND) / REUSE_FRACTION,
  });
  return readUrl.url;
}
