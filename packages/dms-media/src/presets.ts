import { createHash } from "node:crypto";

export type PresetFit = "cover" | "contain" | "inside";

export type PresetFormat = "webp" | "jpeg" | "png" | "avif";

export interface MediaPresetConfig {
  id: string;
  width?: number;
  height?: number;
  fit?: PresetFit;
  format?: PresetFormat;
  quality?: number;
}

const CACHE_KEY_HASH_LENGTH = 8;

export const SVG_MIMETYPE = "image/svg+xml";
export const RASTERIZED_SVG_FORMAT: PresetFormat = "png";

export const DEFAULT_PRESETS: MediaPresetConfig[] = [
  {
    id: "thumb",
    width: 300,
    height: 300,
    fit: "cover",
    format: "webp",
    quality: 80,
  },
  {
    id: "preview",
    width: 1600,
    fit: "inside",
    format: "webp",
    quality: 82,
  },
];

export function presetCacheKey(preset: MediaPresetConfig): string {
  const signature = JSON.stringify({
    width: preset.width,
    height: preset.height,
    fit: preset.fit,
    format: preset.format,
    quality: preset.quality,
  });
  const hash = createHash("sha1")
    .update(signature)
    .digest("hex")
    .slice(0, CACHE_KEY_HASH_LENGTH);
  return `${preset.id}.${hash}`;
}

export function presetMimetype(
  preset: MediaPresetConfig,
  sourceMimetype: string,
): string {
  if (preset.format) return `image/${preset.format}`;
  if (sourceMimetype === SVG_MIMETYPE) return `image/${RASTERIZED_SVG_FORMAT}`;
  return sourceMimetype;
}
