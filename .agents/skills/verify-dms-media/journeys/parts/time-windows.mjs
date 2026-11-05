import { age } from "../../clock.mjs";
import { createFolder, folderAssets, uploaded } from "../../library.mjs";
import { check, image, list, media, pick } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {unknown} body A statistics answer
 * @param {string} id An item
 * @returns {unknown} That item
 */
function item(body, id) {
  return list(body, "items").find((row) => pick(row, "id") === id);
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theOverviewWindowsCountOnlyRecentRows = {
  id: "the-overview-windows-count-only-recent-rows",
  title: "the Files KPI counts the files added in the last 30 days (29 days yes, 31 no), Needs attention and the Uploads page's Failed today tab the uploads failed in the last 24 hours (23 hours yes, 25 no), and the Activity page groups older events under their own day",
  entryPoint: "GET /api/media/stats/kpis, /stats/attention, /upload/batches, /modules/media/activity",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Windows"));
    const before = item((await media(ctx, "KPIs before", "GET", "/stats/kpis")).body, "files");
    const baseFiles = Number(pick(before, "value"));
    const baseAdded = Number(pick(before, "detail", "params", "files", "value"));
    const aged = [];
    for (const [name, days] of [["ancien.png", 31], ["recent.png", 29], ["neuf.png", 0]]) {
      const file = await uploaded(ctx, { folderId: folder.id, name: String(name), mimetype: "image/png", bytes: await image(ctx, { width: 6, height: 6 }) });
      if (Number(days) > 0) aged.push(await age(ctx, "media_assets", file.id, { createdAt: Number(days), updatedAt: Number(days) }));
    }
    const batchIds = [ctx.unique("w25h"), ctx.unique("w23h")];
    for (const [index, failed] of [2, 1].entries()) await media(ctx, `report a batch with ${failed} failed`, "POST", "/upload/batches", { body: { batchId: batchIds[index], folderId: folder.id, total: failed, uploaded: 0, failed, size: 1, failures: Array.from({ length: failed }, (_, index) => ({ name: `w${index}.html`, reason: "type_not_allowed" })) } });
    const reports = list((await media(ctx, "the upload rows", "GET", "/activity?type=uploads&limit=50")).body, "items").filter((row) => String(pick(row, "title")).includes("upload_batch"));
    const newest = String(pick(reports[0], "id"));
    const older = String(pick(reports[1], "id"));
    aged.push(await age(ctx, "media_events", older, { createdAt: 25 / 24 }), await age(ctx, "media_events", newest, { createdAt: 23 / 24 }));
    const kpis = await media(ctx, "KPIs", "GET", "/stats/kpis");
    const attention = await media(ctx, "needs attention", "GET", "/stats/attention");
    const files = item(kpis.body, "files");
    const rows = list((await media(ctx, "the recent batches", "GET", "/upload/batches")).body, "results");
    /** @param {string | undefined} batchId @returns {unknown} */
    const flagOf = (batchId) => pick(rows.find((row) => JSON.stringify(row).includes(String(batchId))), "attention");
    await ctx.verify("the windows", [
      check("every aged row was found", aged.length === 4 && aged.every((count) => count === 1), aged),
      check("Files: three more", pick(files, "value") === baseFiles + 3, [before, files]),
      check("added in the last 30 days: two more, the files of 29 days and of today", pick(files, "detail", "params", "files", "value") === baseAdded + 2, [before, files]),
      check("failed in the last 24 hours: 1, the batch of 23 hours and not the one of 25", pick(item(attention.body, "failed-uploads"), "value") === 1, item(attention.body, "failed-uploads")),
      check("Failed today keeps the batch of 23 hours and not the one of 25", flagOf(batchIds[1]) === "yes" && flagOf(batchIds[0]) !== "yes", [flagOf(batchIds[1]), flagOf(batchIds[0])]),
    ]);
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto("/modules/media/activity");
    await tab.visible({ role: "heading", name: /^Today · /, level: 3 }, { timeoutMs: 30_000 });
    const days = await tab.page.getByRole("heading", { level: 3 }).allTextContents();
    await ctx.verify("older events sit under their own day", [check("Today first, then an earlier day", days.length >= 2 && days[0]?.startsWith("Today") === true && !String(days[days.length - 1]).startsWith("Today"), days)]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theModifiedFilterKeepsItsWindow = {
  id: "the-modified-filter-keeps-its-window",
  title: "the modification date filter keeps the files changed in the last 7 days, the last 30 days or since 1 January, and every file for any date",
  entryPoint: "GET /api/media/folders/:id/assets?modified=7d|30d|year|any",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Modified"));
    const plan = [["d3.png", 3], ["d10.png", 10], ["d40.png", 40], ["d400.png", 400]];
    const aged = [];
    for (const [name, days] of plan) {
      const file = await uploaded(ctx, { folderId: folder.id, name: String(name), mimetype: "image/png", bytes: await image(ctx, { width: 6, height: 6 }) });
      aged.push(await age(ctx, "media_assets", file.id, { updatedAt: Number(days) }));
    }
    const now = new Date();
    const january = new Date(now.getFullYear(), 0, 1).getTime();
    /** @param {(days: number) => boolean} keep @returns {string[]} */
    const expected = (keep) => plan.filter(([, days]) => keep(Number(days))).map(([name]) => String(name)).sort();
    /** @param {string} window @returns {Promise<string[]>} */
    const listed = async (window) => (await folderAssets(ctx, folder.id, { query: `modified=${window}&limit=50` })).assets.map((row) => String(pick(row, "name"))).sort();
    const checks = [check("every file was aged", aged.every((count) => count === 1), aged)];
    /** @type {{ window: string, keep: (days: number) => boolean }[]} */
    const windows = [
      { window: "7d", keep: (days) => days <= 7 },
      { window: "30d", keep: (days) => days <= 30 },
      { window: "year", keep: (days) => now.getTime() - days * DAY_MS >= january },
      { window: "any", keep: () => true },
    ];
    for (const { window, keep } of windows) {
      const got = await listed(window);
      const want = expected(keep);
      checks.push(check(`modified=${window} keeps ${want.join(", ")}`, JSON.stringify(got) === JSON.stringify(want), got));
    }
    await ctx.verify("each window", checks);
  },
};

/**
 * The Overview's time windows.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function overviewWindowJourneys() {
  return [theOverviewWindowsCountOnlyRecentRows];
}

/**
 * The Library's modification date windows.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function libraryWindowJourneys() {
  return [theModifiedFilterKeepsItsWindow];
}
