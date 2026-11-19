import { expect } from "chai";
import sharp from "sharp";
import { configureMediaModule, type DmsMediaConfig } from "../../config";
import type { MediaPresetConfig } from "../../presets";
import { getBaseUrl } from "./http";

const HTTP_FOUND = 302;
const LIT_TOLERANCE = 40;
const BLACK = [0, 0, 0];

/** What one request of an image size answers, and the bytes it redirects to. */
export interface Rendering {
  status: number;
  contentType: string | null;
  bytes: Buffer;
}

/** A decoded image whose pixels are read by position. */
export interface Frame {
  width: number;
  height: number;
  at: (x: number, y: number) => number[];
}

/** Runs with the given image sizes configured, and puts the configuration back. */
export async function withPresets(
  initial: DmsMediaConfig,
  presets: MediaPresetConfig[],
  run: () => Promise<void>,
): Promise<void> {
  configureMediaModule({ ...initial, presets });
  try {
    await run();
  } finally {
    configureMediaModule(initial);
  }
}

/** Requests an image size of a file as its owner and reads what the storage serves. */
export async function render(
  token: string,
  asset: { id: string; name: string },
  preset: string,
): Promise<Rendering> {
  const path = `/media/${asset.id}/${preset}/${encodeURIComponent(asset.name)}`;
  const redirect = await fetch(`${getBaseUrl()}${path}`, {
    redirect: "manual",
    headers: { Authorization: `Bearer ${token}` },
  });
  const location = redirect.headers.get("location");
  if (redirect.status !== HTTP_FOUND || location === null)
    return {
      status: redirect.status,
      contentType: null,
      bytes: Buffer.alloc(0),
    };
  const stored = await fetch(location);
  return {
    status: redirect.status,
    contentType: stored.headers.get("content-type"),
    bytes: Buffer.from(await stored.arrayBuffer()),
  };
}

/** Asserts the format, the served type and the size of a rendering. */
export async function expectRendering(
  rendering: Rendering,
  expected: { format: string; width: number; height: number },
  label: string,
): Promise<void> {
  expect(rendering.status, label).to.equal(HTTP_FOUND);
  expect(rendering.contentType, label).to.equal(`image/${expected.format}`);
  const info = await sharp(rendering.bytes).metadata();
  expect([info.format, info.width, info.height], label).to.deep.equal([
    expected.format,
    expected.width,
    expected.height,
  ]);
}

/** A photo of random noise, which compresses differently at every quality. */
export function noisyImage(
  width: number,
  height: number,
  format: "jpeg" | "png",
): Promise<Buffer> {
  const pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#808080",
      noise: { type: "gaussian", mean: 128, sigma: 60 },
    },
  });
  return format === "jpeg"
    ? pipeline.jpeg().toBuffer()
    : pipeline.png().toBuffer();
}

/** A PNG painted pixel by pixel. */
export function paintedPng(
  width: number,
  height: number,
  colourAt: (x: number, y: number) => number[],
): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      pixels.set(colourAt(x, y), (y * width + x) * 3);
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

export async function decodeFrame(bytes: Buffer): Promise<Frame> {
  const { data, info } = await sharp(bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    at: (x, y) => {
      const offset = (y * info.width + x) * info.channels;
      return [...data.subarray(offset, offset + 3)];
    },
  };
}

/** Whether each channel is within a small tolerance of the target colour. */
export function near(rgb: number[], target: number[]): boolean {
  return target.every(
    (channel, index) =>
      Math.abs((rgb[index] ?? -255) - channel) <= LIT_TOLERANCE,
  );
}

/** How many pixels of the middle row are not black. */
export function litOnMiddleRow(frame: Frame): number {
  const row = Math.floor(frame.height / 2);
  return Array.from({ length: frame.width }, (_, x) => frame.at(x, row)).filter(
    (rgb) => !near(rgb, BLACK),
  ).length;
}
