import { antelopeFmtPreset } from "@antelopejs/tooling-configs/oxc/fmt";

/** Prettier formats the Vue layer; Markdown was never machine-formatted here; the journeys, their helpers and the playground keep their hand-written layout. */
export default antelopeFmtPreset({
  ignorePatterns: [
    "**/*.md",
    "packages/dms-media/frontend-vue/**",
    "**/*.vue",
    "e2e/journeys/**",
    "e2e/*.mjs",
    "e2e/playground/**",
  ],
});
