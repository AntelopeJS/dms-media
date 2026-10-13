import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

export default antelopeKnipConfig({
  ignore: [
    // The front end is a project of its own, with its own manifest and
    // lockfile. The `node --test` script enables Knip's node test runner
    // plugin, whose `**/*.test.*` entries would otherwise reach into it and
    // report its vitest suite against this manifest.
    "frontend-vue/**",
  ],
});
