import { DEFAULT_ROOT_ACL } from "./acl/defaults";
import { DEFAULT_PRESETS, type MediaPresetConfig } from "./presets";
import type { AclEntry } from "./types";

export interface DmsMediaConfig {
  rootAcl?: AclEntry[];
  storage?: string;
  presets?: MediaPresetConfig[];
}

interface ResolvedMediaConfig {
  rootAcl: AclEntry[];
  storage?: string;
  presets: Map<string, MediaPresetConfig>;
}

function buildPresetMap(
  presets: MediaPresetConfig[],
): Map<string, MediaPresetConfig> {
  return new Map(presets.map((preset) => [preset.id, preset]));
}

let currentConfig: ResolvedMediaConfig = {
  rootAcl: DEFAULT_ROOT_ACL,
  presets: buildPresetMap(DEFAULT_PRESETS),
};

export function configureMediaModule(config: DmsMediaConfig): void {
  currentConfig = {
    rootAcl: config.rootAcl ?? DEFAULT_ROOT_ACL,
    storage: config.storage,
    presets: buildPresetMap(config.presets ?? DEFAULT_PRESETS),
  };
}

export function getMediaConfig(): ResolvedMediaConfig {
  return currentConfig;
}
