import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

export default antelopeKnipConfig({
  /**
   * The front end is a project of its own, with its own manifest and
   * lockfile. The `node --test` script enables Knip's node test runner
   * plugin, whose `*.test.*` entries in any folder would otherwise reach into
   * it and report its vitest suite against this manifest.
   */
  ignore: ["frontend-vue/**"],
});
