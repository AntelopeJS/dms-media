import { createFolder, follow, uploaded } from "../../library.mjs";
import { check, image, sharpOf } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/** The documented default sizes: `thumb` 300 × 300, cover, WebP 80, and `preview` 1600 wide, inside, WebP 82. */
const DEFAULTS = [
  { id: "thumb", width: 300, height: 300, fit: "cover", quality: 80 },
  { id: "preview", width: 1600, height: undefined, fit: "inside", quality: 82 },
];

/**
 * Renders a size the way the documented settings say, with the sharp the module itself uses.
 *
 * @param {Buffer} source The original
 * @param {{ width: number, height: number | undefined, fit: string, quality: number }} size The documented settings
 * @returns {Promise<Buffer>} The expected bytes
 */
function expected(source, size) {
  return sharpOf()(source, { animated: false })
    .autoOrient()
    .resize({ width: size.width, height: size.height, fit: size.fit === "inside" ? "inside" : "cover", withoutEnlargement: true })
    .webp({ quality: size.quality })
    .toBuffer();
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theDefaultSizesUseTheirDocumentedSettings = {
  id: "the-default-sizes-use-their-documented-settings",
  title: "without a presets option, thumb is 300 × 300 cover WebP 80 and preview 1600 wide inside WebP 82: each rendering is byte for byte what sharp gives with those settings, and differs from a neighbouring quality",
  entryPoint: "default presets, GET /media/<id>/thumb|preview/<name>",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Defaults"));
    const source = await image(ctx, { width: 2400, height: 1200, format: "jpeg", seed: 11 });
    const file = await uploaded(ctx, { folderId: folder.id, name: "grand.jpg", mimetype: "image/jpeg", bytes: source });
    const checks = [];
    for (const size of DEFAULTS) {
      const served = await follow(ctx, `/media/${file.id}/${size.id}/grand.jpg`, { as: "admin" });
      const want = await expected(source, size);
      const neighbour = await expected(source, { ...size, quality: size.quality - 2 });
      const got = served.file?.bytes ?? Buffer.alloc(0);
      checks.push(
        check(`${size.id}: the bytes of WebP ${size.quality} at the documented size`, Buffer.compare(got, want) === 0, { served: got.byteLength, expected: want.byteLength }),
        check(`${size.id}: not those of WebP ${size.quality - 2}`, Buffer.compare(want, neighbour) !== 0 && Buffer.compare(got, neighbour) !== 0, { neighbour: neighbour.byteLength }),
      );
    }
    await ctx.verify("the default sizes", checks);
  },
};

/**
 * The default sizes against their documented settings.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function defaultRenderJourneys() {
  return [theDefaultSizesUseTheirDocumentedSettings];
}
