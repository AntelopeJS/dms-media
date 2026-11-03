import { createFolder, upload, uploaded, withConfig } from "../../library.mjs";
import { check, image, list, media, pick } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/**
 * @param {unknown} body A statistics answer
 * @param {string} id An item
 * @returns {unknown} That item
 */
function item(body, id) {
  return list(body, "items").find((row) => pick(row, "id") === id);
}

/**
 * The next 04:00 on the server's clock after a moment, as the module's nightly clean-up computes it.
 *
 * @param {Date} now The moment
 * @returns {string} Its ISO form
 */
function nextFourAm(now) {
  const next = new Date(now);
  next.setHours(4, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theOverviewFiguresAreExact = {
  id: "the-overview-figures-are-exact",
  title: "Needs attention counts exactly the files that failed today and the files over 20 MB, not one of exactly 20 MB; Storage by type gives each type's bytes, the original of an edited image included",
  entryPoint: "GET /api/media/stats/attention, /stats/storage",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Figures"));
    const twenty = 20 * 1000 * 1000;
    await uploaded(ctx, { folderId: folder.id, name: "pile.pdf", mimetype: "application/pdf", bytes: Buffer.alloc(twenty, 37) });
    await uploaded(ctx, { folderId: folder.id, name: "plus.pdf", mimetype: "application/pdf", bytes: Buffer.alloc(twenty + 1, 37) });
    const photoBytes = await image(ctx, { width: 300, height: 200 });
    const photo = await uploaded(ctx, { folderId: folder.id, name: "photo.png", mimetype: "image/png", bytes: photoBytes });
    const edited = await media(ctx, "rotate the photo", "POST", `/assets/${photo.id}/transform`, { body: { rotate: 90 } });
    for (const failed of [2, 1]) await media(ctx, `report a batch with ${failed} failed`, "POST", "/upload/batches", { body: { batchId: ctx.unique("b"), folderId: folder.id, total: failed + 1, uploaded: 1, failed, size: 1, failures: Array.from({ length: failed }, (_, index) => ({ name: `f${index}.html`, reason: "type_not_allowed" })) } });
    const attention = await media(ctx, "needs attention", "GET", "/stats/attention");
    const storage = await media(ctx, "storage by type", "GET", "/stats/storage");
    /** @param {string} type @returns {number} */
    const segment = (type) => Number(pick(list(storage.body, "segments").find((row) => pick(row, "label", "params", "type", "key") === `dms_media.types.${type}`), "value"));
    const imageBytes = Number(pick(edited.body, "asset", "size")) + photoBytes.byteLength;
    await ctx.verify("the exact figures", [
      check("failed uploads today: 3, the failed files of both batches", pick(item(attention.body, "failed-uploads"), "value") === 3, item(attention.body, "failed-uploads")),
      check("files over 20 MB: only the one of 20 MB + 1 byte", pick(item(attention.body, "large-files"), "value") === 1, item(attention.body, "large-files")),
      check("PDF: both files' bytes", segment("pdf") === 2 * twenty + 1, segment("pdf")),
      check("images: the edited image and its kept original", segment("image") === imageBytes, [segment("image"), imageBytes]),
      check("the total is the sum of the types", Number(pick(storage.body, "value")) === list(storage.body, "segments").reduce((total, row) => total + Number(pick(row, "value")), 0), storage.body),
    ]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const anUploadThatExactlyFillsThePlanIsAccepted = {
  id: "an-upload-that-exactly-fills-the-plan-is-accepted",
  title: "with storageQuotaBytes set, a file that fills the plan to the byte is accepted, and one more byte is refused with remaining 0",
  entryPoint: "storageQuotaBytes, POST /api/media/upload/presign and confirm",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Exact"));
    await withConfig(ctx, { VERIFY_MEDIA_QUOTA: "6000" }, async () => {
      const used = Number(pick((await media(ctx, "storage the library uses", "GET", "/stats/storage")).body, "value"));
      const fill = await upload(ctx, { folderId: folder.id, name: "remplit.txt", mimetype: "text/plain", bytes: Buffer.alloc(6000 - used, 97) });
      const more = await upload(ctx, { folderId: folder.id, name: "octet.txt", mimetype: "text/plain", bytes: Buffer.from("x") });
      await ctx.verify("the plan's edge", [
        check("the exact fill is accepted", fill.confirm?.status === 200, [used, fill.presign.status, fill.confirm?.status]),
        check("one more byte is refused 413 quota with remaining 0", more.presign.status === 413 && pick(more.presign.body, "reason") === "quota" && pick(more.presign.body, "remaining") === 0, more.presign.body),
      ]);
    });
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theCleanUpAndTheToolbarTellTheTime = {
  id: "the-clean-up-and-the-toolbar-tell-the-time",
  title: "the Cache card's nightly clean-up runs next at 04:00 server time, and the live toolbar's last-read age counts up and starts again after a read",
  entryPoint: "GET /api/media/presets/cache, /modules/media/overview toolbar",
  async run(/** @type {Ctx} */ ctx) {
    const now = new Date();
    const cache = await media(ctx, "read the cache facts", "GET", "/presets/cache");
    const next = pick(item(cache.body, "sweep"), "detail", "params", "next", "value");
    const folder = await createFolder(ctx, ctx.unique("Clock"));
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto("/modules/media/overview");
    await tab.visible({ role: "group", name: "Live updates" }, { timeoutMs: 30_000 });
    /** @returns {Promise<number>} */
    const age = async () => {
      const shown = (await tab.page.getByText(/Updated .* ago/).first().textContent({ timeout: 10_000 }).catch(() => "")) ?? "";
      const match = /Updated (\d+) s ago/.exec(shown);
      return match ? Number(match[1]) : /just now|now/i.test(shown) ? 0 : -1;
    };
    await tab.page.waitForTimeout(8000);
    const later = await age();
    await uploaded(ctx, { folderId: folder.id, name: "tic.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
    await tab.visible({ role: "link", name: /^Files 2/ }, { timeoutMs: 15_000 });
    const fresh = await age();
    await ctx.verify("the times", [
      check("the next clean-up is the next 04:00 on the server's clock", next === nextFourAm(now), [next, nextFourAm(now)]),
      check("the toolbar's age counts up while nothing changes", later >= 6, later),
      check("a read starts it again", fresh >= 0 && fresh < later, [later, fresh]),
    ]);
  },
};

/**
 * Journeys of the Overview's exact figures and of the storage plan's edge.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function overviewFigureJourneys() {
  return [theOverviewFiguresAreExact, anUploadThatExactlyFillsThePlanIsAccepted, theCleanUpAndTheToolbarTellTheTime];
}
