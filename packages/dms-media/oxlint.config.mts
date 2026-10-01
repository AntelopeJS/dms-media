import { defineConfig } from "oxlint";
import { sharedLintConfig } from "../../oxlint.config.mts";

export default defineConfig({
  ...sharedLintConfig,
  // Front-end sources, which oxlint cannot lint yet: they move with the
  // front-end migration.
  ignorePatterns: [...sharedLintConfig.ignorePatterns, "frontend-vue/**"],
  overrides: [
    {
      files: ["src/test/**/*.test.ts", "tests/**/*.test.mjs"],
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
