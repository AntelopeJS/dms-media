import { existsSync } from "node:fs";
import { guarded } from "../guard.mjs";
import { createFolder, folderAssets, upload, uploaded, withConfig } from "../library.mjs";
import { check, image, list, longText, media, pick, raw, recordRaw, sha256, storagePath, text } from "../media.mjs";
import { pickerJourneys } from "./parts/pickers.mjs";
import { refusalJourneys } from "./parts/refusals.mjs";
import { uploadPageJourneys } from "./parts/upload-page.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */
/** @typedef {import("../library.mjs").Upload} Upload */

/**
 * @param {Ctx} ctx The journey
 * @param {Upload} done An upload
 * @returns {import("../media.mjs").Answer} The answer of the step that refused it
 */
function refusal(ctx, done) {
  return done.presign.status === 200 && done.confirm ? done.confirm : done.presign;
}

/**
 * Checks that an answer is the documented refusal body.
 *
 * @param {import("../media.mjs").Answer} answer The refusal
 * @param {number} status Its status
 * @param {string} reason Its reason
 * @returns {import("../media.mjs").Check[]} The checks
 */
function refused(answer, status, reason) {
  return [
    check(`HTTP ${status}`, answer.status === status, answer.status),
    check(`reason ${reason}`, pick(answer.body, "reason") === reason, answer.body),
    check("a message", text(answer.body, "message").length > 0, answer.body),
  ];
}

/**
 * The folder bound to an asset field of the verification playground.
 *
 * @param {Ctx} ctx The journey
 * @param {string} bindingId The binding
 * @returns {Promise<string>} The folder id
 */
async function boundFolder(ctx, bindingId) {
  const answer = await media(ctx, `read the folder of ${bindingId}`, "GET", `/bindings/${bindingId}/folder`);
  return text(answer.body, "folder", "id") || text(answer.body, "id");
}

/** Uploads go from the browser straight to the storage: `presign`, a `PUT`, `confirm`, each checked. */
export const journeys = guarded([
  {
    id: "three-steps-keep-every-byte",
    title: "presign answers a staged storage URL, the PUT lands there, confirm creates the file: every byte of a multi-chunk upload and its non-ASCII name are kept",
    entryPoint: "POST /api/media/upload/presign, PUT <storage>, POST /api/media/upload/confirm",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Uploads"));
      const bytes = longText(60_000);
      const done = await uploaded(ctx, { folderId: folder.id, name: "Rapport annuel — été 2026 (東京).txt", mimetype: "text/plain", bytes });
      await ctx.verify("presign answers a staged key on the storage's own origin", [
        check("a staged resource key", text(done.presign.body, "resourceKey").startsWith("__staging__/"), done.presign.body),
        check("the upload URL is the storage's", text(done.presign.body, "uploadUrl").includes("/file-storage/upload/"), done.presign.body),
        check("the API never took the bytes", !text(done.presign.body, "uploadUrl").includes("/api/media"), done.presign.body),
      ]);
      const listed = await folderAssets(ctx, folder.id);
      await ctx.verify("the file is listed with its name and size", [
        check("the name as sent", listed.assets[0]?.name === "Rapport annuel — été 2026 (東京).txt", listed.assets[0]?.name),
        check("the size of the bytes", listed.assets[0]?.size === bytes.byteLength, listed.assets[0]?.size),
      ]);
      const url = await media(ctx, "ask for a read URL", "GET", `/assets/${done.id}/read-url`);
      const read = await raw(ctx, "read the stored file", { url: new URL(text(url.body, "url"), ctx.state.apiUrl).href });
      recordRaw(ctx, read, [check("the same bytes, in order", sha256(read.bytes) === sha256(bytes), `${read.bytes.byteLength} of ${bytes.byteLength}`)]);
      const staged = await upload(ctx, { folderId: folder.id, name: "other.txt", mimetype: "text/plain", bytes: Buffer.from("x") });
      const elsewhere = await createFolder(ctx, ctx.unique("Elsewhere"));
      const wrongFolder = await media(ctx, "confirm a key presigned for another folder", "POST", "/upload/confirm", {
        body: { folderId: elsewhere.id, resourceKey: text(staged.presign.body, "resourceKey"), filename: "other.txt" },
      });
      await ctx.verify("a key is confirmed only in its own folder", [check("400", wrongFolder.status === 400, wrongFolder.body)]);
    },
  },
  {
    id: "abort-deletes-the-staged-file",
    title: "abort deletes a staged upload, so confirming it afterwards fails and nothing is listed",
    entryPoint: "POST /api/media/upload/abort",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Aborted"));
      const presign = await media(ctx, "presign", "POST", "/upload/presign", { body: { folderId: folder.id, filename: "a.txt", size: 3, mimetype: "text/plain" } });
      const resourceKey = text(presign.body, "resourceKey");
      await raw(ctx, "PUT the bytes", { url: text(presign.body, "uploadUrl"), method: "PUT", headers: { "content-type": "text/plain" }, body: Buffer.from("abc") });
      const stagedFile = storagePath(ctx, resourceKey);
      const before = existsSync(stagedFile);
      const abort = await media(ctx, "abort", "POST", "/upload/abort", { body: { folderId: folder.id, resourceKey } });
      const confirm = await media(ctx, "confirm the aborted upload", "POST", "/upload/confirm", { body: { folderId: folder.id, resourceKey, filename: "a.txt" } });
      const listed = await folderAssets(ctx, folder.id);
      await ctx.verify("the staged file is gone", [
        check("it was staged", before, stagedFile),
        check("abort answers ok", abort.status === 200, abort.body),
        check("the staged file is deleted", !existsSync(stagedFile), stagedFile),
        check("confirm fails", confirm.status !== 200, confirm.status),
        check("nothing is listed", listed.assets.length === 0, listed.assets),
      ]);
    },
  },
  ...refusalJourneys(),
  {
    id: "a-field-folder-refuses-other-types",
    title: "a folder bound to a PDF field refuses an image with 415 field_type listing what the field accepts, and so does a subfolder of an image field for a PDF",
    entryPoint: "POST /api/media/upload/presign into a linked folder",
    async run(/** @type {Ctx} */ ctx) {
      const sheets = await boundFolder(ctx, "verify.sheets");
      const png = await upload(ctx, { folderId: sheets, name: "x.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
      await ctx.verify("an image into the PDF field's folder", [...refused(png.presign, 415, "field_type"), check("accepted lists the field's types", JSON.stringify(pick(png.presign.body, "accepted")) === JSON.stringify(["application/pdf"]), png.presign.body)]);
      const pdf = await uploaded(ctx, { folderId: sheets, name: "fiche.pdf", mimetype: "application/pdf", bytes: Buffer.from("%PDF-1.4\n%%EOF\n") });
      const projects = await boundFolder(ctx, "verify.projects");
      const sub = await createFolder(ctx, "Projet A", { parentId: projects });
      const inSub = await upload(ctx, { folderId: sub.id, name: "plan.pdf", mimetype: "application/pdf", bytes: Buffer.from("%PDF-1.4\n") });
      await ctx.verify("a PDF into a subfolder of the image field", [check("the PDF went in its own field's folder", pdf.id !== "", pdf.id), ...refused(inSub.presign, 415, "field_type"), check("accepted lists image/*", JSON.stringify(pick(inSub.presign.body, "accepted")) === JSON.stringify(["image/*"]), inSub.presign.body)]);
    },
  },
  {
    id: "the-storage-plan-refuses-what-goes-past-it",
    title: "with storageQuotaBytes set, presign and confirm refuse with 413 quota, remaining and quota, an upload that would go past it",
    entryPoint: "storageQuotaBytes, POST /api/media/upload/presign and confirm",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Quota"));
      await withConfig(ctx, { VERIFY_MEDIA_QUOTA: "5000" }, async () => {
        const first = await uploaded(ctx, { folderId: folder.id, name: "a.txt", mimetype: "text/plain", bytes: Buffer.alloc(3000, 97) });
        const storage = await media(ctx, "read the storage the library uses", "GET", "/stats/storage");
        const used = Number(pick(storage.body, "value"));
        const presigned = await media(ctx, "presign a second file that still fits", "POST", "/upload/presign", { body: { folderId: folder.id, filename: "b.txt", size: 1500, mimetype: "text/plain" } });
        const over = await upload(ctx, { folderId: folder.id, name: "c.txt", mimetype: "text/plain", bytes: Buffer.alloc(2500, 98) });
        await ctx.verify("presign refuses what goes past the plan", [
          check("the first file fits", first.id !== "", first.id),
          ...refused(over.presign, 413, "quota"),
          check("remaining is the plan minus what the library holds", pick(over.presign.body, "remaining") === 5000 - used, [used, over.presign.body]),
          check("quota is the plan", pick(over.presign.body, "quota") === 5000, over.presign.body),
        ]);
        await uploaded(ctx, { folderId: folder.id, name: "d.txt", mimetype: "text/plain", bytes: Buffer.alloc(1800, 100) });
        await raw(ctx, "PUT the presigned bytes", { url: text(presigned.body, "uploadUrl"), method: "PUT", headers: { "content-type": "text/plain" }, body: Buffer.alloc(1500, 99) });
        const confirm = await media(ctx, "confirm it once the plan is used up", "POST", "/upload/confirm", { body: { folderId: folder.id, resourceKey: text(presigned.body, "resourceKey"), filename: "b.txt" } });
        await ctx.verify("confirm checks the plan again", [...refused(confirm, 413, "quota"), check("remaining", pick(confirm.body, "remaining") === 5000 - used - 1800, [used, confirm.body])]);
      });
    },
  },
  {
    id: "a-declared-image-must-decode",
    title: "confirm refuses with 422 invalid_image an image that does not decode and deletes the staged file; a file that decodes as another format is stored with the decoded type; a format sharp does not decode is not checked",
    entryPoint: "POST /api/media/upload/confirm",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Decode"));
      for (const mimetype of ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/tiff"]) {
        const broken = await upload(ctx, { folderId: folder.id, name: `broken.${mimetype.slice(6)}`, mimetype, bytes: Buffer.from("not an image at all") });
        const stagedFile = storagePath(ctx, text(broken.presign.body, "resourceKey"));
        const putDone = (broken.put?.status ?? 0) === 200;
        await ctx.verify(`a broken ${mimetype}`, [...refused(refusal(ctx, broken), 422, "invalid_image"), check("the PUT landed", putDone, broken.put?.status), check("the staged file is deleted", !existsSync(stagedFile), stagedFile)]);
      }
      const jpeg = await image(ctx, { width: 10, height: 6, format: "jpeg" });
      const claimed = await uploaded(ctx, { folderId: folder.id, name: "photo.png", mimetype: "image/png", bytes: jpeg });
      const bmp = await uploaded(ctx, { folderId: folder.id, name: "old.bmp", mimetype: "image/bmp", bytes: Buffer.from("BM not decoded") });
      await ctx.verify("the stored type is what sharp read", [
        check("a JPEG declared as PNG is stored as image/jpeg", pick(claimed.asset, "mimetype") === "image/jpeg", claimed.asset),
        check("with its dimensions", pick(claimed.asset, "width") === 10 && pick(claimed.asset, "height") === 6, claimed.asset),
        check("a BMP is not decoded, so it is accepted", bmp.id !== "" && pick(bmp.asset, "mimetype") === "image/bmp", bmp.asset),
      ]);
    },
  },
  {
    id: "keep-both-names-add-a-number",
    title: "names answers a free name for each file whose name is taken in the folder, whatever its case: photo (2).jpg, then photo (3).jpg",
    entryPoint: "POST /api/media/upload/names",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Names"));
      await uploaded(ctx, { folderId: folder.id, name: "photo.jpg", mimetype: "image/jpeg", bytes: await image(ctx, { width: 4, height: 4, format: "jpeg" }) });
      await uploaded(ctx, { folderId: folder.id, name: "Photo (2).JPG", mimetype: "image/jpeg", bytes: await image(ctx, { width: 4, height: 4, format: "jpeg" }) });
      const answer = await media(ctx, "ask for free names", "POST", "/upload/names", { body: { folderId: folder.id, filenames: ["PHOTO.jpg", "new.jpg", "été.png"] } });
      const free = pick(answer.body, "names");
      await ctx.verify("the free names", [
        check("200", answer.status === 200, answer.status),
        check("a taken name gets the next free number, case aside, and a free name none", JSON.stringify(free) === JSON.stringify(["PHOTO (3).jpg", null, null]), free),
      ]);
    },
  },
  {
    id: "batches-are-recorded-and-listed",
    title: "a recorded batch is listed with its folder, its counts, its size and its result, and a batch with a failure stays in failed today",
    entryPoint: "POST and GET /api/media/upload/batches",
    async run(/** @type {Ctx} */ ctx) {
      const folderName = ctx.unique("Batches");
      const folder = await createFolder(ctx, folderName);
      const batchId = ctx.unique("batch");
      await uploaded(ctx, { folderId: folder.id, name: "one.txt", mimetype: "text/plain", bytes: Buffer.from("1"), batchId });
      const report = await media(ctx, "record the batch", "POST", "/upload/batches", {
        body: { batchId, folderId: folder.id, total: 2, uploaded: 1, failed: 1, size: 1, failures: [{ name: "two.html", reason: "type_not_allowed" }] },
      });
      const batches = await media(ctx, "read the batches", "GET", "/upload/batches");
      const row = list(batches.body, "results").find((entry) => JSON.stringify(entry).includes(batchId) || pick(entry, "folderId") === folder.id);
      await ctx.verify("the batch is listed", [
        check("recorded", report.status === 200, report.body),
        check("one row for the folder", row !== undefined, batches.body),
        check("its folder", pick(row, "folder") === folderName && pick(row, "folderId") === folder.id, row),
        check("its files, failures and size", pick(row, "files") === 1 && pick(row, "failed") === 1 && pick(row, "size") === 1, row),
        check("its result names the refused file", pick(row, "result") === "partial" && JSON.stringify(pick(row, "resultDetail")).includes("two.html"), row),
        check("a failed file keeps it in failed today", pick(row, "attention") === "yes", row),
        check("when it finished", text(row, "finishedAt") !== "", row),
      ]);
    },
  },
  ...uploadPageJourneys(),
  ...pickerJourneys(),
]);
