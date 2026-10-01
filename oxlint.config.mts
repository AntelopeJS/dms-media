import { defineConfig } from "oxlint";
import {
  ANTELOPE_IGNORE_PATTERNS,
  antelopePreset,
} from "@antelopejs/tooling-configs/oxc/lint";

/**
 * The repository-wide rule set. Package configs spread it and add only what is
 * specific to them, so the rules themselves are declared once.
 */
export const sharedLintConfig = {
  extends: [
    antelopePreset({
      // Turned on repository-wide with the import-sorting pass, so the
      // reordering lands as one reviewable change everywhere at once.
      importSorting: false,
    }),
  ],
  ignorePatterns: ANTELOPE_IGNORE_PATTERNS,
  options: {
    typeAware: true,
    // Ceiling on the warning debt, so CI catches the new ones. Zero means
    // "nothing the current rule set reports", not "nothing left".
    maxWarnings: 0,
  },
};

export default defineConfig(sharedLintConfig);
