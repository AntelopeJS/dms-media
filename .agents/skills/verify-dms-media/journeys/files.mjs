import { guarded } from "../guard.mjs";
import { createFolder, deliveryPath, follow, setVisibility, uploaded } from "../library.mjs";
import { check, image, isRow, list, longText, media, pick, raw, sha256, signedLifetime, text } from "../media.mjs";
import { filePageJourneys } from "./parts/file-page.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */

/**
 * @param {unknown} body The previews answer
 * @returns {Record<string, unknown>} The previews by asset id
 */
function previewsOf(body) {
  const previews = pick(body, "previews");
  return isRow(previews) ? previews : {};
}

/** One file's life through the API: rename, describe, move, delete, read it back, act on many at once. */
export const journeys = guarded([
  {
    id: "rename-describe-move-and-delete-a-file",
    title: "a file's name and alt text read back after an update; a name taken in its folder ignoring case and Unicode form is refused 409; a move changes its folder; a delete removes it",
    entryPoint: "POST /api/media/assets/:id/update, /move, DELETE /assets/:id",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Files"));
      const target = await createFolder(ctx, ctx.unique("Target"));
      const file = await uploaded(ctx, { folderId: folder.id, name: "a.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
      await uploaded(ctx, { folderId: folder.id, name: "Été.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
      const update = await media(ctx, "rename and describe", "POST", `/assets/${file.id}/update`, { body: { name: "b é.png", alt: "Un toit au soleil, 東京" } });
      const taken = await media(ctx, "rename onto a taken name", "POST", `/assets/${file.id}/update`, { body: { name: "ÉTÉ.png" } });
      const longAlt = await media(ctx, "alt over 255", "POST", `/assets/${file.id}/update`, { body: { alt: "a".repeat(256) } });
      const read = await media(ctx, "read it back", "GET", `/assets/${file.id}`);
      const move = await media(ctx, "move it", "POST", `/assets/${file.id}/move`, { body: { folderId: target.id } });
      const moved = await media(ctx, "read it after the move", "GET", `/assets/${file.id}`);
      const removed = await media(ctx, "delete it", "DELETE", `/assets/${file.id}`);
      const gone = await media(ctx, "read it after the delete", "GET", `/assets/${file.id}`);
      await ctx.verify("each change reads back", [
        check("name and alt", update.status === 200 && pick(read.body, "asset", "name") === "b é.png" && pick(read.body, "asset", "alt") === "Un toit au soleil, 東京", read.body),
        check("a taken name is 409 name_taken", taken.status === 409 && JSON.stringify(taken.body).includes("name_taken"), taken.body),
        check("alt over 255 is 400", longAlt.status === 400 && JSON.stringify(longAlt.body).includes("alt_too_long"), longAlt.body),
        check("moved", move.status === 200 && pick(moved.body, "asset", "folderId") === target.id, moved.body),
        check("deleted", removed.status === 200 && gone.status === 404, [removed.status, gone.status]),
      ]);
    },
  },
  {
    id: "read-urls-previews-and-search",
    title: "a read URL lives five minutes and serves the file or one of its sizes; previews give thumbnails of images only; the asset list and the asset search answer the readable files by name and type",
    entryPoint: "GET /api/media/assets/:id/read-url?preset=, GET /previews?ids=, GET /assets, GET /assets/search",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Reads"));
      const bytes = await image(ctx, { width: 500, height: 400 });
      const photo = await uploaded(ctx, { folderId: folder.id, name: "Toiture été.png", mimetype: "image/png", bytes });
      const doc = await uploaded(ctx, { folderId: folder.id, name: "toiture.pdf", mimetype: "application/pdf", bytes: Buffer.from("%PDF-1.4\n%%EOF\n") });
      const original = await media(ctx, "read URL of the original", "GET", `/assets/${photo.id}/read-url`);
      const thumb = await media(ctx, "read URL of the thumb", "GET", `/assets/${photo.id}/read-url?preset=thumb`);
      const originalBytes = await raw(ctx, "follow the original read URL", { url: new URL(text(original.body, "url"), ctx.state.apiUrl).href });
      const thumbBytes = await raw(ctx, "follow the thumb read URL", { url: new URL(text(thumb.body, "url"), ctx.state.apiUrl).href });
      const previews = await media(ctx, "previews of both", "GET", `/previews?ids=${photo.id}&ids=${doc.id}`);
      const all = await media(ctx, "list every readable file", "GET", "/assets");
      const search = await media(ctx, "search toiture among PDFs", "GET", `/assets/search?q=toiture&mime=application/&folderId=${folder.id}`);
      const lifetime = signedLifetime(ctx, text(original.body, "url"));
      await ctx.verify("the reads", [
        check("the read URL lives five minutes", lifetime > 240 && lifetime <= 300, lifetime),
        check("it serves the original", sha256(originalBytes.bytes) === sha256(bytes), originalBytes.bytes.byteLength),
        check("the preset read URL serves the rendering", thumbBytes.status === 200 && thumbBytes.bytes.byteLength > 0 && sha256(thumbBytes.bytes) !== sha256(bytes), thumbBytes.bytes.byteLength),
        check("a preview for the image only", JSON.stringify(Object.keys(previewsOf(previews.body))) === JSON.stringify([photo.id]), previews.body),
        check("the list holds both files", [photo.id, doc.id].every((id) => list(all.body, "assets").some((row) => pick(row, "id") === id)), list(all.body, "assets").length),
        check("search by name and type finds the PDF only", JSON.stringify(list(search.body, "assets").map((row) => pick(row, "id"))) === JSON.stringify([doc.id]), search.body),
      ]);
    },
  },
  {
    id: "bulk-actions-answer-done-and-refused",
    title: "bulk move, visibility and delete take up to 500 ids, act on each they can and answer the ids done and the ids refused with a reason",
    entryPoint: "POST /api/media/assets/bulk/move, /visibility, /delete",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Bulk"));
      const target = await createFolder(ctx, ctx.unique("Bulk target"));
      const a = await uploaded(ctx, { folderId: folder.id, name: "a.txt", mimetype: "text/plain", bytes: Buffer.from("a") });
      const b = await uploaded(ctx, { folderId: folder.id, name: "b.txt", mimetype: "text/plain", bytes: Buffer.from("b") });
      const missing = "no-such-asset";
      const moved = await media(ctx, "bulk move", "POST", "/assets/bulk/move", { body: { ids: [a.id, b.id, missing], folderId: target.id } });
      const shown = await media(ctx, "bulk publish", "POST", "/assets/bulk/visibility", { body: { ids: [a.id, missing], visibility: "public" } });
      const anon = await raw(ctx, "the published file, anonymously", { path: `/media/${a.id}/a.txt` });
      const removed = await media(ctx, "bulk delete", "POST", "/assets/bulk/delete", { body: { ids: [a.id, b.id] } });
      const tooMany = await media(ctx, "bulk delete 501 ids", "POST", "/assets/bulk/delete", { body: { ids: Array.from({ length: 501 }, (_, index) => `id-${index}`) } });
      const fiveHundred = await media(ctx, "bulk delete 500 unknown ids", "POST", "/assets/bulk/delete", { body: { ids: Array.from({ length: 500 }, (_, index) => `id-${index}`) } });
      const after = await media(ctx, "read a after the delete", "GET", `/assets/${a.id}`);
      await ctx.verify("done and refused", [
        check("move: both done, the unknown refused", JSON.stringify(pick(moved.body, "done")) === JSON.stringify([a.id, b.id]) && list(moved.body, "refused").map((row) => pick(row, "id")).join() === missing, moved.body),
        check("a refusal has a status and a message", Number.isInteger(pick(list(moved.body, "refused")[0], "status")) && text(list(moved.body, "refused")[0], "message") !== "", moved.body),
        check("visibility: done for the file", JSON.stringify(pick(shown.body, "done")) === JSON.stringify([a.id]) && anon.status === 302, [shown.body, anon.status]),
        check("delete: both done", JSON.stringify(pick(removed.body, "done")) === JSON.stringify([a.id, b.id]) && after.status === 404, removed.body),
        check("501 ids refused 400", tooMany.status === 400, tooMany.status),
        check("500 ids accepted, each refused", fiveHundred.status === 200 && list(fiveHundred.body, "refused").length === 500, fiveHundred.status),
      ]);
    },
  },
  {
    id: "the-file-api-reads-its-tabs",
    title: "details, information, history, delivery links on the public origin with each image size, the delivery notice and the tab counts read back a file",
    entryPoint: "GET /api/media/assets/:id/details, /information, /history, /delivery, /delivery/notice, /tab-counts, /links/origin",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Tabs"));
      const photo = await uploaded(ctx, { folderId: folder.id, name: "onglets.png", mimetype: "image/png", bytes: await image(ctx, { width: 40, height: 30 }) });
      await media(ctx, "rename it", "POST", `/assets/${photo.id}/update`, { body: { name: "onglets 2.png" } });
      const origin = text((await media(ctx, "links origin", "GET", "/links/origin")).body, "origin");
      const details = await media(ctx, "details", "GET", `/assets/${photo.id}/details`);
      const information = await media(ctx, "information", "GET", `/assets/${photo.id}/information`);
      const history = await media(ctx, "history", "GET", `/assets/${photo.id}/history`);
      const delivery = await media(ctx, "delivery", "GET", `/assets/${photo.id}/delivery`);
      const notice = await media(ctx, "delivery notice", "GET", `/assets/${photo.id}/delivery/notice`);
      const counts = await media(ctx, "tab counts", "GET", `/assets/${photo.id}/tab-counts`);
      const links = JSON.stringify(delivery.body);
      const events = list(history.body, "items").map((row) => text(row, "title"));
      await ctx.verify("each tab's reads", [
        check("the origin is the public API URL", origin === ctx.state.webUrl, origin),
        check("details name the file", JSON.stringify(details.body).includes("onglets 2.png"), details.body),
        check("information names the uploader", JSON.stringify(information.body).includes("Verify Admin"), information.body),
        check("history lists every event from the upload on, newest first", events.length === 2 && events[0]?.endsWith("asset_rename") === true && events[1]?.endsWith("asset_upload") === true, events),
        check("the delivery links of the original and each size start with the origin", links.includes(`${origin}/media/${photo.id}/${encodeURIComponent("onglets 2.png")}`) && links.includes(`${origin}/media/${photo.id}/thumb/`) && links.includes(`${origin}/media/${photo.id}/preview/`), delivery.body),
        check("a notice", notice.status === 200, notice.body),
        check("the delivery tab counts the original and two sizes", pick(counts.body, "delivery") === 3, counts.body),
      ]);
    },
  },
  {
    id: "stored-files-stay-readable",
    title: "a file and its folder written before a restart of the backend read back unchanged after it: listing, details, delivery bytes and a size",
    entryPoint: "backend restart, GET /api/media/folders/:id/assets, GET /media/...",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Kept"));
      const bytes = longText(30_000);
      const photoBytes = await image(ctx, { width: 320, height: 200 });
      const doc = await uploaded(ctx, { folderId: folder.id, name: "notes été.txt", mimetype: "text/plain", bytes });
      const photo = await uploaded(ctx, { folderId: folder.id, name: "vue.png", mimetype: "image/png", bytes: photoBytes });
      await media(ctx, "describe the photo", "POST", `/assets/${photo.id}/update`, { body: { alt: "Vue" } });
      await setVisibility(ctx, "assets", photo.id, "public");
      await follow(ctx, `/media/${photo.id}/thumb/vue.png`);
      await ctx.restartBackend();
      const listed = await media(ctx, "list the folder after the restart", "GET", `/folders/${folder.id}/assets`);
      const delivered = await follow(ctx, deliveryPath(doc.asset), { as: "admin" });
      const thumb = await follow(ctx, `/media/${photo.id}/thumb/vue.png`);
      const read = await media(ctx, "read the photo", "GET", `/assets/${photo.id}`);
      await ctx.verify("everything reads back", [
        check("both files listed", list(listed.body, "assets").length === 2, listed.body),
        check("the text's bytes", delivered.file !== null && sha256(delivered.file.bytes) === sha256(bytes), delivered.link.status),
        check("the photo's alt, visibility and size", pick(read.body, "asset", "alt") === "Vue" && pick(read.body, "asset", "visibility") === "public" && pick(read.body, "asset", "width") === 320, read.body),
        check("its rendering is served anonymously", thumb.link.status === 302 && thumb.file?.status === 200, thumb.link.status),
      ]);
    },
  },
  ...filePageJourneys(),
]);
