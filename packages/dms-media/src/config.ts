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

export interface DmsMediaConfig {
  rootAcl?: AclEntry[];
  storage?: string;
  presets?: MediaPresetConfig[];
  /** Storage plan of the library, in bytes: uploads past it are refused. */
  storageQuotaBytes?: number;
  /**
   * File types members may upload, as mimetypes (`image/*` matches a prefix).
   * HTML and XHTML stay refused whatever this list says.
   */
  allowedMimetypes?: string[];
  /**
   * Public URL of the API, the origin serving `/media`: copied links and the
   * file page's delivery tab start with it. Defaults to the origin the API
   * request came on.
   */
  publicBaseUrl?: string;
}

interface ResolvedMediaConfig {
  rootAcl: AclEntry[];
  storage?: string;
  presets: Map<string, MediaPresetConfig>;
  storageQuotaBytes?: number;
  allowedMimetypes: readonly string[];
  publicBaseUrl?: string;
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
};

export function configureMediaModule(config: DmsMediaConfig): void {
  currentConfig = {
    rootAcl: config.rootAcl ?? DEFAULT_ROOT_ACL,
    storage: config.storage,
    presets: buildPresetMap(config.presets ?? DEFAULT_PRESETS),
    storageQuotaBytes: config.storageQuotaBytes,
    allowedMimetypes: config.allowedMimetypes ?? DEFAULT_ALLOWED_MIMETYPES,
    publicBaseUrl: config.publicBaseUrl?.trim() || undefined,
  };
}

export function getMediaConfig(): ResolvedMediaConfig {
  return currentConfig;
}
