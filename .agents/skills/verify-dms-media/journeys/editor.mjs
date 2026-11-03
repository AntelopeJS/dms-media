import { guarded } from "../guard.mjs";
import { createFolder, folderAssets, follow, uploaded } from "../library.mjs";
import { check, image, imageInfo, media, pick, sha256, SVG, text } from "../media.mjs";
import { editorPageJourneys } from "./parts/editor-page.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */

/**
 * The bytes a file's stable link serves now, and what sharp reads in them.
 *
 * @param {Ctx} ctx The journey
 * @param {string} path The delivery path
 * @returns {Promise<{ sha: string, width: number, height: number, format: string }>} The served image
 */
async function served(ctx, path) {
  const delivered = await follow(ctx, path, { as: "admin" });
  const bytes = delivered.file?.bytes ?? Buffer.alloc(0);
  return { sha: sha256(bytes), ...(await imageInfo(ctx, bytes)) };
}

/** Crop and rotation on the server: Save overwrites, Save as copy adds a file, the original is kept for Revert. */
export const journeys = guarded([
  {
    id: "save-overwrites-everywhere-and-keeps-the-original",
    title: "a saved rotation is what the same link and every size serve next, the first save keeps the original upload and counts it in the storage, a later crop keeps that original, and Revert restores it byte for byte",
    entryPoint: "POST /api/media/assets/:id/transform, /revert",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Edits"));
      const bytes = await image(ctx, { width: 400, height: 200 });
      const file = await uploaded(ctx, { folderId: folder.id, name: "paysage.png", mimetype: "image/png", bytes });
      const path = `/media/${file.id}/paysage.png`;
      const thumbBefore = await served(ctx, `/media/${file.id}/thumb/paysage.png`);
      const storageBefore = Number(pick((await media(ctx, "storage before", "GET", "/stats/storage")).body, "value"));
      const rotated = await media(ctx, "rotate by 90°", "POST", `/assets/${file.id}/transform`, { body: { rotate: 90 } });
      const afterRotate = await served(ctx, path);
      const thumbAfter = await served(ctx, `/media/${file.id}/thumb/paysage.png`);
      const storageAfter = Number(pick((await media(ctx, "storage after", "GET", "/stats/storage")).body, "value"));
      const cropped = await media(ctx, "crop the left half", "POST", `/assets/${file.id}/transform`, { body: { crop: { x: 0, y: 0, width: 0.5, height: 1 } } });
      const afterCrop = await served(ctx, path);
      const reverted = await media(ctx, "revert to the original", "POST", `/assets/${file.id}/revert`);
      const afterRevert = await served(ctx, path);
      await ctx.verify("the edits", [
        check("rotate answers 200×400 and keeps the original", rotated.status === 200 && pick(rotated.body, "asset", "width") === 200 && pick(rotated.body, "asset", "height") === 400 && pick(rotated.body, "asset", "hasOriginal") === true, rotated.body),
        check("the same link serves the rotated image", afterRotate.width === 200 && afterRotate.height === 400 && afterRotate.sha !== sha256(bytes), afterRotate),
        check("the thumb is rendered again from the rotated image", thumbAfter.sha !== thumbBefore.sha && thumbAfter.height > thumbAfter.width && thumbBefore.width > thumbBefore.height, [thumbBefore, thumbAfter]),
        check("the original counts in the storage", storageAfter >= storageBefore + bytes.byteLength, [storageBefore, storageAfter]),
        check("a later crop applies to the image as edited: the left half of 200×400", cropped.status === 200 && afterCrop.width === 100 && afterCrop.height === 400, afterCrop),
        check("the original is still kept after the second save", pick(cropped.body, "asset", "hasOriginal") === true, cropped.body),
        check("revert serves the original's bytes", reverted.status === 200 && afterRevert.sha === sha256(bytes) && pick(reverted.body, "asset", "width") === 400, afterRevert),
      ]);
    },
  },
  {
    id: "save-as-copy-leaves-the-source-untouched",
    title: "Save as copy writes the edit as a new file in the same folder and the source keeps its bytes",
    entryPoint: "POST /api/media/assets/:id/transform/copy",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Copies"));
      const bytes = await image(ctx, { width: 300, height: 100, format: "jpeg" });
      const file = await uploaded(ctx, { folderId: folder.id, name: "bandeau.jpg", mimetype: "image/jpeg", bytes });
      const copy = await media(ctx, "save a crop as a copy", "POST", `/assets/${file.id}/transform/copy`, { body: { crop: { x: 0, y: 0, width: 0.5, height: 1 } } });
      const copyId = text(copy.body, "asset", "id");
      const source = await served(ctx, `/media/${file.id}/bandeau.jpg`);
      const edited = await served(ctx, `/media/${copyId}/${encodeURIComponent(text(copy.body, "asset", "name"))}`);
      const listed = await folderAssets(ctx, folder.id);
      await ctx.verify("a copy beside its source", [
        check("a new file in the same folder", copyId !== "" && copyId !== file.id && pick(copy.body, "asset", "folderId") === folder.id && listed.assets.length === 2, copy.body),
        check("the copy is the crop", edited.width === 150 && edited.height === 100, edited),
        check("the source keeps its bytes", source.sha === sha256(bytes), source),
      ]);
    },
  },
  {
    id: "only-raster-photos-are-edited",
    title: "JPEG, PNG, WebP and AVIF are edited; an SVG or a GIF is refused 422; a request with no operation, a rotation outside 90° steps or a crop past the image is refused 400 and nothing changes",
    entryPoint: "POST /api/media/assets/:id/transform",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Formats"));
      const results = [];
      for (const format of ["jpeg", "png", "webp", "avif"]) {
        const file = await uploaded(ctx, { folderId: folder.id, name: `x.${format}`, mimetype: `image/${format}`, bytes: await image(ctx, { width: 20, height: 10, format }) });
        const answer = await media(ctx, `rotate the ${format}`, "POST", `/assets/${file.id}/transform`, { body: { rotate: 90 } });
        results.push(check(`${format} is edited`, answer.status === 200 && pick(answer.body, "asset", "width") === 10, answer.body));
      }
      const svg = await uploaded(ctx, { folderId: folder.id, name: "v.svg", mimetype: "image/svg+xml", bytes: SVG });
      const gif = await uploaded(ctx, { folderId: folder.id, name: "g.gif", mimetype: "image/gif", bytes: await image(ctx, { width: 10, height: 10, format: "gif" }) });
      const png = await uploaded(ctx, { folderId: folder.id, name: "p.png", mimetype: "image/png", bytes: await image(ctx, { width: 10, height: 10 }) });
      const turned = await uploaded(ctx, { folderId: folder.id, name: "t.png", mimetype: "image/png", bytes: await image(ctx, { width: 30, height: 10 }) });
      const half = await media(ctx, "rotate 180°", "POST", `/assets/${turned.id}/transform`, { body: { rotate: 180 } });
      const threeQuarters = await media(ctx, "rotate 270° more", "POST", `/assets/${turned.id}/transform`, { body: { rotate: 270 } });
      results.push(check("180° keeps 30×10", half.status === 200 && pick(half.body, "asset", "width") === 30, half.body), check("then 270° turns it to 10×30", threeQuarters.status === 200 && pick(threeQuarters.body, "asset", "width") === 10 && pick(threeQuarters.body, "asset", "height") === 30, threeQuarters.body));
      const svgEdit = await media(ctx, "rotate the SVG", "POST", `/assets/${svg.id}/transform`, { body: { rotate: 90 } });
      const gifEdit = await media(ctx, "rotate the GIF", "POST", `/assets/${gif.id}/transform`, { body: { rotate: 90 } });
      const none = await media(ctx, "no operation", "POST", `/assets/${png.id}/transform`, { body: {} });
      const tilted = await media(ctx, "rotate 45°", "POST", `/assets/${png.id}/transform`, { body: { rotate: 45 } });
      const past = await media(ctx, "crop past the image", "POST", `/assets/${png.id}/transform`, { body: { crop: { x: 0.6, y: 0, width: 0.5, height: 1 } } });
      const read = await media(ctx, "read the PNG", "GET", `/assets/${png.id}`);
      await ctx.verify("what the editor takes", [
        ...results,
        check("an SVG is refused 422", svgEdit.status === 422, svgEdit.status),
        check("a GIF is refused 422", gifEdit.status === 422, gifEdit.status),
        check("no operation 400", none.status === 400, none.status),
        check("45° 400", tilted.status === 400, tilted.status),
        check("a crop past the image 400", past.status === 400, past.status),
        check("the PNG is unchanged", pick(read.body, "asset", "hasOriginal") === false, read.body),
      ]);
    },
  },
  ...editorPageJourneys(),
]);
