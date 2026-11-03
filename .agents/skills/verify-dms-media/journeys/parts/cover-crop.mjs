import { createFolder, follow, uploaded } from "../../library.mjs";
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

/**
 * Journeys of how a cover size crops.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function coverCropJourneys() {
  return [coverCroppingIsCentred];
}
