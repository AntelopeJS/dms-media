import { antelopeFmtPreset } from "@antelopejs/tooling-configs/oxc/fmt";

/**
 * The repository-wide formatting style. Markdown is never formatted; packages
 * pass the extra paths only they have to skip.
 */
export const sharedFmtConfig = (ignorePatterns: string[] = []) =>
  antelopeFmtPreset({ ignorePatterns: ["**/*.md", ...ignorePatterns] });

export default sharedFmtConfig();
