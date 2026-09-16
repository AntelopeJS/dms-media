import { defineConfig } from "oxlint";
import {
  ANTELOPE_IGNORE_PATTERNS,
  antelopePreset,
} from "@antelopejs/tooling-configs/oxc/lint";

export default defineConfig({
  extends: [
    antelopePreset({
      // Turned on repository-wide with the import-sorting pass, so the
      // reordering lands as one reviewable change everywhere at once.
      importSorting: false,
    }),
  ],
  // Front-end sources, which oxlint cannot lint yet: they move with the
  // front-end migration.
  ignorePatterns: [...ANTELOPE_IGNORE_PATTERNS, "frontend-vue/**"],
  options: {
    typeAware: true,
    // Ceiling on the warning debt, so CI catches the new ones.
    //
    // The drop from 73 is mostly the preset and the test override, not debt
    // paid: 0.0.4 leaves eight anti-slop rules off and the suites stop being
    // measured as functions. Twelve were actual fixes. Zero means "nothing
    // the current rule set reports", not "nothing left".
    maxWarnings: 0,
  },
  overrides: [
    {
      files: ["src/test/**/*.test.ts"],
      rules: {
        // A `describe` block is not a function anyone splits, and an integration
        // suite's length is its coverage. These ceilings are about code someone has
        // to hold in their head at once, which is not what a test file asks of a
        // reader.
        "eslint/max-lines": "off",
        "eslint/max-lines-per-function": "off",
      },
    },
  ],
});
