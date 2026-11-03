import { chmodSync, mkdirSync } from "node:fs";
import { guarded } from "../guard.mjs";
import { createFolder, follow, setVisibility, uploaded, withConfig } from "../library.mjs";
import { check, image, imageInfo, list, media, pick, recordRaw, storagePath, SVG, text } from "../media.mjs";
import { presetPageJourneys } from "./parts/preset-page.mjs";

/**
 * @typedef {import("../media.mjs").Ctx} Ctx
 * @typedef {{ format: string, width: number, height: number, bytes: number, status: number | null, cache: string }} Rendering
 */

/**
 * Requests one image size of a file and reads what the storage serves.
 *
 * @param {Ctx} ctx The journey
 * @param {{ id: string, name: string }} file The file
 * @param {string} preset The size
 * @returns {Promise<Rendering>} The redirect's status and cache policy, and the rendered image
 */
export async function rendering(ctx, file, preset) {
  const delivered = await follow(ctx, `/media/${file.id}/${preset}/${encodeURIComponent(file.name)}`, { as: "admin" });
  const info = delivered.file ? await imageInfo(ctx, delivered.file.bytes) : { format: "", width: 0, height: 0 };
  const result = { ...info, bytes: delivered.file?.bytes.byteLength ?? 0, status: delivered.link.status, cache: delivered.link.headers["cache-control"] ?? "" };
  recordRaw(ctx, delivered.link, [check(`${preset} answered`, true, result)]);
  return result;
}

/**
 * @param {Rendering} got What was rendered
 * @param {string} format The expected format
 * @param {number} width The expected width
 * @param {number} height The expected height
 * @returns {import("../media.mjs").Check} The check
 */
function renders(got, format, width, height) {
  return check(`${format} ${width}×${height}`, got.status === 302 && got.format === format && got.width === width && got.height === height, got);
}

/**
 * One fact of the Cache card: its unit and its count, such as `hours 1`.
 *
 * @param {unknown} body The cache answer
 * @param {string} id The fact
 * @returns {string} Its unit and count
 */
function cacheValue(body, id) {
  const value = pick(list(body, "items").find((row) => pick(row, "id") === id), "value");
  return `${text(value, "key").split(".").pop()} ${String(pick(value, "params", "count", "value"))}`;
}

/** Named image sizes, rendered by sharp on first request and served from stable links. */
export const journeys = guarded([
  {
    id: "default-sizes-render-on-first-request",
    title: "thumb renders 300×300 WebP cropped square, preview fits 1600 wide in WebP and never upscales, and the Image sizes API counts the cached renderings",
    entryPoint: "GET /media/<id>/<preset>/<name>, GET /api/media/presets",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Sizes"));
      const small = await uploaded(ctx, { folderId: folder.id, name: "petite été.jpg", mimetype: "image/jpeg", bytes: await image(ctx, { width: 800, height: 600, format: "jpeg" }) });
      const large = await uploaded(ctx, { folderId: folder.id, name: "large.png", mimetype: "image/png", bytes: await image(ctx, { width: 2000, height: 1000 }) });
      const before = await media(ctx, "read the sizes", "GET", "/presets");
      const thumb = await rendering(ctx, { id: small.id, name: "petite été.jpg" }, "thumb");
      const preview = await rendering(ctx, { id: small.id, name: "petite été.jpg" }, "preview");
      const largePreview = await rendering(ctx, { id: large.id, name: "large.png" }, "preview");
      const after = await media(ctx, "read the sizes again", "GET", "/presets");
      /** @param {unknown} body @param {string} id @returns {unknown} */
      const rendered = (body, id) => pick(list(body, "presets").find((row) => pick(row, "id") === id), "rendered");
      await ctx.verify("the default sizes", [
        renders(thumb, "webp", 300, 300),
        renders(preview, "webp", 800, 600),
        renders(largePreview, "webp", 1600, 800),
        check("the redirect is never cached", thumb.cache === "no-store", thumb.cache),
        check("thumb counts one more cached rendering", Number(rendered(after.body, "thumb")) === Number(rendered(before.body, "thumb")) + 1, [rendered(before.body, "thumb"), rendered(after.body, "thumb")]),
        check("preview counts two more", Number(rendered(after.body, "preview")) === Number(rendered(before.body, "preview")) + 2, [rendered(before.body, "preview"), rendered(after.body, "preview")]),
      ]);
    },
  },
  {
    id: "configured-sizes-follow-their-fields",
    title: "a presets list replaces the defaults; width or height alone keeps the ratio, neither keeps the size, cover is the default fit, contain fills the box, inside fits it, no format keeps the source's, quality applies with a format, and an SVG renders as PNG",
    entryPoint: "presets option, GET /media/<id>/<preset>/<name>",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Configured"));
      const presets = ["thumb:300:300:cover:webp:80", "wide:200:::jpeg:30", "sharp:200:::jpeg:95", "box:100:50:contain:png:", "fit:100:50:inside::", "tall::120:::", "same:::::", "cov:50:50::png:", "vector:::::", "vecwebp:80:::webp:"].join(";");
      await withConfig(ctx, { VERIFY_MEDIA_PRESETS: presets }, async () => {
        const photo = await uploaded(ctx, { folderId: folder.id, name: "photo.jpg", mimetype: "image/jpeg", bytes: await image(ctx, { width: 400, height: 300, format: "jpeg" }) });
        const logo = await uploaded(ctx, { folderId: folder.id, name: "logo.svg", mimetype: "image/svg+xml", bytes: SVG });
        const file = { id: photo.id, name: "photo.jpg" };
        const wide = await rendering(ctx, file, "wide");
        const sharper = await rendering(ctx, file, "sharp");
        const box = await rendering(ctx, file, "box");
        const fit = await rendering(ctx, file, "fit");
        const tall = await rendering(ctx, file, "tall");
        const same = await rendering(ctx, file, "same");
        const cov = await rendering(ctx, file, "cov");
        const vector = await rendering(ctx, { id: logo.id, name: "logo.svg" }, "vector");
        const vectorWebp = await rendering(ctx, { id: logo.id, name: "logo.svg" }, "vecwebp");
        const preview = await follow(ctx, `/media/${photo.id}/preview/photo.jpg`, { as: "admin" });
        await ctx.verify("each size follows its fields", [
          renders(wide, "jpeg", 200, 150),
          check("quality applies with a format: q95 is heavier than q30", sharper.bytes > wide.bytes && sharper.width === 200, [wide.bytes, sharper.bytes]),
          renders(box, "png", 100, 50),
          renders(fit, "jpeg", 67, 50),
          renders(tall, "jpeg", 160, 120),
          renders(same, "jpeg", 400, 300),
          renders(cov, "png", 50, 50),
          check("an SVG without a format renders as PNG", vector.format === "png" && vector.status === 302, vector),
          check("an SVG with a format renders in it", vectorWebp.format === "webp" && vectorWebp.width === 80, vectorWebp),
          check("the list replaced the defaults: preview is gone", preview.link.status === 404, preview.link.status),
        ]);
      });
    },
  },
  {
    id: "sizes-refuse-what-they-cannot-render",
    title: "an unknown size and a size of a file that is not an image answer 404, an image sharp cannot read 422, and a size the storage cannot write 503",
    entryPoint: "GET /media/<id>/<preset>/<name>",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Refused sizes"));
      const photo = await uploaded(ctx, { folderId: folder.id, name: "ok.png", mimetype: "image/png", bytes: await image(ctx, { width: 20, height: 20 }) });
      const pdf = await uploaded(ctx, { folderId: folder.id, name: "doc.pdf", mimetype: "application/pdf", bytes: Buffer.from("%PDF-1.4\n%%EOF\n") });
      const bmp = await uploaded(ctx, { folderId: folder.id, name: "old.bmp", mimetype: "image/bmp", bytes: Buffer.from("BM this is not readable") });
      const unknown = await follow(ctx, `/media/${photo.id}/huge/ok.png`, { as: "admin" });
      const notImage = await follow(ctx, `/media/${pdf.id}/thumb/doc.pdf`, { as: "admin" });
      const unreadable = await follow(ctx, `/media/${bmp.id}/thumb/old.bmp`, { as: "admin" });
      const locked = storagePath(ctx, "files", "media-derivatives", photo.id);
      mkdirSync(locked, { recursive: true });
      chmodSync(locked, 0o500);
      const failed = await follow(ctx, `/media/${photo.id}/thumb/ok.png`, { as: "admin" });
      chmodSync(locked, 0o700);
      await ctx.verify("each refusal has its status", [
        check("unknown size 404", unknown.link.status === 404, unknown.link.status),
        check("a size of a PDF 404", notImage.link.status === 404, notImage.link.status),
        check("an unreadable image 422", unreadable.link.status === 422, unreadable.link.status),
        check("a rendering the storage cannot write 503", failed.link.status === 503, failed.link.status),
      ]);
    },
  },
  {
    id: "a-changed-size-renders-again-from-the-same-link",
    title: "after thumb changes in the config, the same link serves the new rendering, under a new cache key, with no cache to clear",
    entryPoint: "presets option changed, GET /media/<id>/thumb/<name>",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Changed"));
      const photo = await uploaded(ctx, { folderId: folder.id, name: "c.png", mimetype: "image/png", bytes: await image(ctx, { width: 500, height: 400 }) });
      const before = await rendering(ctx, { id: photo.id, name: "c.png" }, "thumb");
      const keyBefore = await media(ctx, "read the cache key", "GET", "/presets");
      await withConfig(ctx, { VERIFY_MEDIA_PRESETS: "thumb:100:100:cover:png:" }, async () => {
        const after = await rendering(ctx, { id: photo.id, name: "c.png" }, "thumb");
        const keyAfter = await media(ctx, "read the cache key again", "GET", "/presets");
        /** @param {unknown} body @returns {string} */
        const key = (body) => text(list(body, "presets").find((row) => pick(row, "id") === "thumb"), "cacheKey");
        await ctx.verify("the new settings show on the same link", [
          renders(before, "webp", 300, 300),
          renders(after, "png", 100, 100),
          check("a new cache key", key(keyBefore.body) !== key(keyAfter.body) && key(keyAfter.body).startsWith("thumb."), [key(keyBefore.body), key(keyAfter.body)]),
        ]);
      });
    },
  },
  {
    id: "the-sizes-api-gives-copyable-examples",
    title: "the sizes list has no example while the library holds no image, then an example on the public origin built on the public photo, and a preview path; the cache facts give the signed link lifetimes and the config block names every size",
    entryPoint: "GET /api/media/presets, /presets/cache, /presets/config",
    async run(/** @type {Ctx} */ ctx) {
      const none = await media(ctx, "read the sizes with no public image", "GET", "/presets");
      const folder = await createFolder(ctx, ctx.unique("Examples"));
      const photo = await uploaded(ctx, { folderId: folder.id, name: "exemple été.png", mimetype: "image/png", bytes: await image(ctx, { width: 50, height: 40 }) });
      await setVisibility(ctx, "assets", photo.id, "public");
      await uploaded(ctx, { folderId: folder.id, name: "newer private.png", mimetype: "image/png", bytes: await image(ctx, { width: 50, height: 40 }) });
      const some = await media(ctx, "read the sizes with a public image", "GET", "/presets");
      const thumbRow = list(some.body, "presets").find((row) => pick(row, "id") === "thumb");
      const noneThumb = list(none.body, "presets").find((row) => pick(row, "id") === "thumb");
      const origin = await media(ctx, "read the links' origin", "GET", "/links/origin");
      const base = text(origin.body, "origin");
      const cache = await media(ctx, "read the cache facts", "GET", "/presets/cache");
      const config = await media(ctx, "read the config block", "GET", "/presets/config");
      const sweepRow = list(cache.body, "items").find((row) => pick(row, "id") === "sweep");
      const examplePath = `/media/${photo.id}/thumb/${encodeURIComponent("exemple été.png")}`;
      await ctx.verify("the examples and facts", [
        check("no example while the library holds no image", pick(noneThumb, "exampleUrl") === null && pick(noneThumb, "examplePreviewUrl") === null, noneThumb),
        check("the example link is the public origin plus the path", pick(thumbRow, "exampleUrl") === `${base}${examplePath}` && base.startsWith("http"), [base, thumbRow]),
        check("the preview is the path the dashboard shows", pick(thumbRow, "examplePreviewUrl") === examplePath, thumbRow),
        check("public links live one hour", cacheValue(cache.body, "public") === "hours 1", cache.body),
        check("private links live five minutes", cacheValue(cache.body, "private") === "minutes 5", cache.body),
        check("the nightly clean-up's last and next run", /sweep_(never|last)/.test(JSON.stringify(sweepRow)) && pick(sweepRow, "detail", "params", "next", "type") === "datetime", sweepRow),
        check("the config block declares thumb and preview", /presets/.test(text(config.body, "code")) && /thumb/.test(text(config.body, "code")) && /preview/.test(text(config.body, "code")), config.body),
      ]);
    },
  },
  ...presetPageJourneys(),
]);
