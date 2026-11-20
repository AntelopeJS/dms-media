import { type DmsMediaConfig, getMediaConfig } from "../../config";

/** The configuration in force, in the shape `configureMediaModule` takes back. */
export function snapshotConfig(): DmsMediaConfig {
  const current = getMediaConfig();
  return {
    rootAcl: current.rootAcl,
    storage: current.storage,
    presets: [...current.presets.values()],
    storageQuotaBytes: current.storageQuotaBytes,
    allowedMimetypes: [...current.allowedMimetypes],
    publicBaseUrl: current.publicBaseUrl,
    automation: { readUrlMaxTtlSeconds: current.readUrlMaxTtlSeconds },
  };
}
