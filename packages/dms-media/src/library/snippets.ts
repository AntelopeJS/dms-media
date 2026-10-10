import type { AssetBindingField } from "@antelopejs/interface-dms-media";
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

/** What an `AssetType` declaration of a linked folder is written from. */
export interface AssetTypeSnippetInput {
  id: string;
  folderName: string;
  field: AssetBindingField;
  fromPage: boolean;
  read: string[];
  write: string[];
}

function indent(lines: string[], depth: number): string[] {
  return lines.map((line) => `${INDENT.repeat(depth)}${line}`);
}

function quotedList(values: string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
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

function fieldLines(field: AssetBindingField): string[] {
  const lines: string[] = [];
  if (field.multiple) lines.push("multiple: true,");
  if (field.max !== undefined) lines.push(`max: ${field.max},`);
  if (field.mimetypes?.length)
    lines.push(`mimetypes: ${quotedList(field.mimetypes)},`);
  return lines;
}

function permissionLines(input: AssetTypeSnippetInput): string[] {
  if (input.fromPage) return ["permissionsFromPage: YourPage,"];
  return [
    "permissionMapping: {",
    ...indent(
      [
        `read: ${quotedList(input.read)},`,
        `write: ${quotedList(input.write)},`,
      ],
      1,
    ),
    "},",
  ];
}

/** The `AssetType` declaration that provisions a linked folder. */
export function assetTypeSnippet(input: AssetTypeSnippetInput): string {
  const binding = [
    `id: ${JSON.stringify(input.id)},`,
    `folderName: ${JSON.stringify(input.folderName)},`,
    ...permissionLines(input),
  ];
  return [
    "new AssetType({",
    ...indent(fieldLines(input.field), 1),
    ...indent(["binding: {", ...indent(binding, 1), "},"], 1),
    "});",
  ].join("\n");
}
