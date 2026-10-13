import type { MediaPresetConfig } from "../presets";

const INDENT = "  ";
const PRESET_KEYS = [
  "id",
  "width",
  "height",
  "fit",
  "format",
  "quality",
] as const;

function indent(lines: string[], depth: number): string[] {
  return lines.map((line) => `${INDENT.repeat(depth)}${line}`);
}

function presetLine(preset: MediaPresetConfig): string {
  const entries = PRESET_KEYS.filter((key) => preset[key] !== undefined).map(
    (key) => [key, preset[key]],
  );
  return JSON.stringify(Object.fromEntries(entries));
}

/** The `presets` block of `antelope.config.ts` that declares these presets. */
export function presetsConfigSnippet(presets: MediaPresetConfig[]): string {
  const lines = presets.map(
    (preset, index) =>
      `${presetLine(preset)}${index < presets.length - 1 ? "," : ""}`,
  );
  return [
    '"dms-media": {',
    ...indent(['"config": {'], 1),
    ...indent(['"presets": ['], 2),
    ...indent(lines, 3),
    ...indent(["]"], 2),
    ...indent(["}"], 1),
    "}",
  ].join("\n");
}
