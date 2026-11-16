import { createFolder, follow, uploaded, withConfig } from "../../library.mjs";
import { check, sharpOf } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/** The three bands of the test image, left to right. */
const BANDS = [
  [220, 30, 30],
  [30, 200, 30],
  [30, 30, 220],
];

/**
 * A 900 × 300 PNG of three equal vertical bands, red, green and blue: a centred square crop holds only green.
 *
 * @returns {Promise<Buffer>} Its bytes
 */
async function bands() {
  const width = 900;
  const height = 300;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colour = BANDS[Math.min(Math.floor(x / 300), 2)] ?? [0, 0, 0];
      pixels.set(colour, (y * width + x) * 3);
    }
  }
  return sharpOf()(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/**
 * @param {Buffer} bytes An image
 * @param {number} fraction Where across the image, from 0 to 1, on its middle row
 * @returns {Promise<number[]>} The RGB of that pixel
 */
async function pixelAt(bytes, fraction) {
  const { data, info } = await sharpOf()(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const x = Math.min(Math.floor(info.width * fraction), info.width - 1);
  const offset = (Math.floor(info.height / 2) * info.width + x) * info.channels;
  return [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0];
}

/**
 * @param {number[]} rgb A pixel
 * @returns {boolean} Whether it is the green band's
 */
function green(rgb) {
  const [red = 0, middle = 0, blue = 0] = rgb;
  return middle > 150 && red < 90 && blue < 90;
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const coverCroppingIsCentred = {
  id: "cover-cropping-is-centred",
  title: "a cover size crops around the centre, with no focal point: the square thumb of a red, green and blue banded image is all green, edge to edge",
  entryPoint: "/media/:id/thumb/:name",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Centre"));
    const file = await uploaded(ctx, { folderId: folder.id, name: "bandes.png", mimetype: "image/png", bytes: await bands() });
    const delivered = await follow(ctx, `/media/${file.id}/thumb/bandes.png`, { as: "admin" });
    const bytes = delivered.file?.bytes ?? Buffer.alloc(0);
    const samples = [];
    for (const fraction of [0.02, 0.5, 0.98]) samples.push(bytes.byteLength > 0 ? await pixelAt(bytes, fraction) : []);
    await ctx.verify("the thumb is the middle band", [
      check("the thumb was served", bytes.byteLength > 0, delivered.link.status),
      check("its left edge, centre and right edge are green", samples.every(green), samples),
    ]);
  },
};

const WHITE = [240, 240, 240];
const RED = [220, 30, 30];
const BLUE = [30, 30, 220];
const GREEN = [30, 200, 30];
const BLACK = [0, 0, 0];

/**
 * A 400 × 300 PNG: white, with a red band across the top, a blue band across the bottom and a green band down the left.
 * Cropped to 2:1 it loses both horizontal bands; scaled to fit it keeps them.
 *
 * @returns {Promise<Buffer>} Its bytes
 */
async function framed() {
  const width = 400;
  const height = 300;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colour = y < 30 ? RED : y >= 270 ? BLUE : x < 40 ? GREEN : WHITE;
      pixels.set(colour, (y * width + x) * 3);
    }
  }
  return sharpOf()(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/**
 * @param {Ctx} ctx The journey
 * @param {string} id The file
 * @param {string} size The image size
 * @returns {Promise<Frame>} The rendering's pixels, null when it was not served
 */
async function rendering(ctx, id, size) {
  const delivered = await follow(ctx, `/media/${id}/${size}/framed.png`, { as: "admin" });
  if (!delivered.file || delivered.file.bytes.byteLength === 0) return null;
  const { data, info } = await sharpOf()(delivered.file.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, at: (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)] };
}

/**
 * @param {number[]} rgb A pixel
 * @param {number[]} target A colour
 * @returns {boolean} Whether each channel is within 40 of the colour's
 */
function near(rgb, target) {
  return target.every((channel, index) => Math.abs((rgb[index] ?? -255) - channel) <= 40);
}

/** @typedef {{ width: number, height: number, at: (x: number, y: number) => number[] } | null} Frame */

/**
 * @param {Frame} found A rendering
 * @returns {number} How many pixels of its middle row are not black
 */
function lit(found) {
  return found ? Array.from({ length: found.width }, (_, x) => found.at(x, 25)).filter((rgb) => !near(rgb, BLACK)).length : -1;
}

/**
 * @param {Frame} found The contain rendering
 * @returns {import("../../media.mjs").Check[]} What it must show
 */
function containChecks(found) {
  return [
    check("it is the box, 100 × 50", found?.width === 100 && found.height === 50, [found?.width, found?.height]),
    check("the image is 67 pixels wide on the middle row, the 4:3 ratio kept", Math.abs(lit(found) - 67) <= 1, lit(found)),
    check("black bars on both sides", found !== null && near(found.at(2, 25), BLACK) && near(found.at(97, 25), BLACK), [found?.at(2, 25), found?.at(97, 25)]),
    check("nothing cropped: the red band on top and the blue band at the bottom", found !== null && near(found.at(50, 1), RED) && near(found.at(50, 48), BLUE), [found?.at(50, 1), found?.at(50, 48)]),
  ];
}

/**
 * @param {Frame} found The cover rendering
 * @returns {import("../../media.mjs").Check[]} What it must show
 */
function coverChecks(found) {
  return [
    check("it is the box, 100 × 50", found?.width === 100 && found.height === 50, [found?.width, found?.height]),
    check("no bar: every pixel of the middle row is the image", lit(found) === 100, lit(found)),
    check("the green band at the left edge fills the box", found !== null && near(found.at(2, 25), GREEN), found?.at(2, 25)),
    check("cropped: the top and bottom bands are gone", found !== null && near(found.at(50, 1), WHITE) && near(found.at(50, 48), WHITE), [found?.at(50, 1), found?.at(50, 48)]),
  ];
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const containKeepsTheWholeImageAndCoverFillsTheBox = {
  id: "contain-keeps-the-whole-image-and-cover-fills-the-box",
  title: "in a 100 × 50 box a contain size keeps the whole 4:3 image, 67 × 50 on black bars with its top and bottom bands, and a cover size fills the box edge to edge and crops those bands away",
  entryPoint: "presets option, GET /media/:id/:size/:name",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Fit"));
    await withConfig(ctx, { VERIFY_MEDIA_PRESETS: "boxcontain:100:50:contain:png:;boxcover:100:50:cover:png:" }, async () => {
      const file = await uploaded(ctx, { folderId: folder.id, name: "framed.png", mimetype: "image/png", bytes: await framed() });
      await ctx.verify("contain keeps the whole image inside the box", containChecks(await rendering(ctx, file.id, "boxcontain")));
      await ctx.verify("cover fills the box", coverChecks(await rendering(ctx, file.id, "boxcover")));
    });
  },
};

/**
 * Journeys of how a cover size crops and how a contain size fits.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function coverCropJourneys() {
  return [coverCroppingIsCentred, containKeepsTheWholeImageAndCoverFillsTheBox];
}
