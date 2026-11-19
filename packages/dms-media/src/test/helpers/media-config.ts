import { configureMediaModule, type DmsMediaConfig } from "../../config";
import { snapshotConfig } from "./config";

/** Runs `run` with the module configured as the current configuration plus `overrides`, then restores it. */
export async function withMediaConfig<Result>(
  overrides: DmsMediaConfig,
  run: () => Promise<Result>,
): Promise<Result> {
  const initial = snapshotConfig();
  configureMediaModule({ ...initial, ...overrides });
  try {
    return await run();
  } finally {
    configureMediaModule(initial);
  }
}
