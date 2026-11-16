import { e2eConfig } from "@antelopejs/dms/e2e";
import { defineConfig } from "@playwright/test";

/**
 * The kit's config with playwright-core's 30 s action and navigation timeouts,
 * which Playwright Test turns off: the journeys' bounded waits rely on them,
 * as they do under `dms-control journey`.
 */
export default defineConfig(e2eConfig(), {
  use: { actionTimeout: 30_000, navigationTimeout: 30_000 },
});
