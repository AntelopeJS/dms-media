import { defineConfig } from "oxlint";
import {
  ANTELOPE_IGNORE_PATTERNS,
  antelopePreset,
} from "@antelopejs/tooling-configs/oxc/lint";

/** The module's Vue layer keeps its own ESLint setup until the front end migrates. */
export default defineConfig({
  extends: [antelopePreset({ importSorting: false })],
  ignorePatterns: [
    ...ANTELOPE_IGNORE_PATTERNS,
    "packages/dms-media/frontend-vue/**",
  ],
  options: { typeAware: true, maxWarnings: 0 },
  overrides: [
    {
      files: [
        "packages/dms-media/src/test/**/*.test.ts",
        "packages/dms-media/tests/**/*.test.mjs",
      ],
      rules: {
        "eslint/max-lines": "off",
        "eslint/max-lines-per-function": "off",
      },
    },
  ],
});
