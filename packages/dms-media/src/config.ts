import { DEFAULT_ROOT_ACL } from "./acl/defaults";
import { DEFAULT_PRESETS, type MediaPresetConfig } from "./presets";
import type { AclEntry } from "./types";

/**
 * File types the library accepts by default: images, video, audio, PDF,
 * office documents, plain text and CSV. A trailing `*` matches a prefix.
 */
export const DEFAULT_ALLOWED_MIMETYPES: readonly string[] = [
  "image/*",
  "video/*",
  "audio/*",
  "application/pdf",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.*",
  "application/vnd.oasis.opendocument.*",
  "application/rtf",
  "text/plain",
  "text/markdown",
  "text/csv",
];

/** Default and ceiling of a signed link's lifetime: 7 days, the presigned-URL limit of S3-compatible storages. */
export const DEFAULT_READ_URL_MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Shortest lifetime a signed link may have. */
export const MIN_READ_URL_TTL_SECONDS = 60;

/** Settings of the module's automation nodes. */
export interface DmsMediaAutomationConfig {
  /**
   * Longest lifetime, in seconds, of a link `media.create-read-url` signs.
   * At most the default, 7 days; a value under 60 or not a number falls back
   * to the default.
   */
  readUrlMaxTtlSeconds?: number;
}

export interface DmsMediaConfig {
  rootAcl?: AclEntry[];
  storage?: string;
  presets?: MediaPresetConfig[];
  /** Storage plan of the library, in bytes: uploads past it are refused. */
  storageQuotaBytes?: number;
  /**
   * File types members may upload, as mimetypes (`image/*` matches a prefix).
   * HTML, XHTML and PHP stay refused, by type or by extension, whatever this
   * list says.
   */
  allowedMimetypes?: string[];
  /**
   * Public URL of the API, the origin serving `/media`: copied links and the
   * file page's delivery tab start with it. Defaults to the DMS `apiBaseUrl`.
   * With neither set, links stay relative.
   */
  publicBaseUrl?: string;
  automation?: DmsMediaAutomationConfig;
}

interface ResolvedMediaConfig {
  rootAcl: AclEntry[];
  storage?: string;
  presets: Map<string, MediaPresetConfig>;
  storageQuotaBytes?: number;
  allowedMimetypes: readonly string[];
  publicBaseUrl?: string;
  readUrlMaxTtlSeconds: number;
}

function buildPresetMap(
  presets: MediaPresetConfig[],
): Map<string, MediaPresetConfig> {
  return new Map(presets.map((preset) => [preset.id, preset]));
}

let currentConfig: ResolvedMediaConfig = {
  rootAcl: DEFAULT_ROOT_ACL,
  presets: buildPresetMap(DEFAULT_PRESETS),
  allowedMimetypes: DEFAULT_ALLOWED_MIMETYPES,
  readUrlMaxTtlSeconds: DEFAULT_READ_URL_MAX_TTL_SECONDS,
};

/**
 * The configured lifetime ceiling when it is a number of seconds between
 * {@link MIN_READ_URL_TTL_SECONDS} and the default, else the default.
 */
function readUrlCeiling(configured: number | undefined): number {
  const isUsable =
    Number.isFinite(configured) &&
    (configured ?? 0) >= MIN_READ_URL_TTL_SECONDS;
  return isUsable
    ? Math.min(configured ?? 0, DEFAULT_READ_URL_MAX_TTL_SECONDS)
    : DEFAULT_READ_URL_MAX_TTL_SECONDS;
}

export function configureMediaModule(config: DmsMediaConfig): void {
  currentConfig = {
    rootAcl: config.rootAcl ?? DEFAULT_ROOT_ACL,
    storage: config.storage,
    presets: buildPresetMap(config.presets ?? DEFAULT_PRESETS),
    storageQuotaBytes: config.storageQuotaBytes,
    allowedMimetypes: config.allowedMimetypes ?? DEFAULT_ALLOWED_MIMETYPES,
    publicBaseUrl: config.publicBaseUrl?.trim() || undefined,
    readUrlMaxTtlSeconds: readUrlCeiling(
      config.automation?.readUrlMaxTtlSeconds,
    ),
  };
}

export function getMediaConfig(): ResolvedMediaConfig {
  return currentConfig;
}
