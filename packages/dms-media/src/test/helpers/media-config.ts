import {
  configureMediaModule,
  type DmsMediaConfig,
  getMediaConfig,
} from "../../config";

/** The configuration in force, in the shape `configureMediaModule` takes back. */
function currentConfig(): DmsMediaConfig {
  const current = getMediaConfig();
  return {
    rootAcl: current.rootAcl,
    storage: current.storage,
    presets: [...current.presets.values()],
    storageQuotaBytes: current.storageQuotaBytes,
    allowedMimetypes: [...current.allowedMimetypes],
    publicBaseUrl: current.publicBaseUrl,
  };
}

/** Runs `run` with the module configured as the current configuration plus `overrides`, then restores it. */
export async function withMediaConfig<Result>(
  overrides: DmsMediaConfig,
  run: () => Promise<Result>,
): Promise<Result> {
  const initial = currentConfig();
  configureMediaModule({ ...initial, ...overrides });
  try {
    return await run();
  } finally {
    configureMediaModule(initial);
  }
}
