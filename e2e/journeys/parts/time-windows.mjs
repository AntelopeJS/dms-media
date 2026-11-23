import { age } from "../../clock.mjs";
import { createFolder, uploaded } from "../../library.mjs";
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
 * @typedef {{ before: unknown, baseFiles: number, baseAdded: number, batchIds: string[], aged: number[] }} Windows
 */

/**
 * Adds files and upload reports, then ages them to the edges of the two windows.
 *
 * @param {Ctx} ctx The journey context
 * @returns {Promise<Windows>} The figures before and the ages applied
 */
async function seedAgedRows(ctx) {
  const folder = await createFolder(ctx, ctx.unique("Windows"));
  const before = item(
    (await media(ctx, "KPIs before", "GET", "/stats/kpis")).body,
    "files",
  );
  const baseFiles = Number(pick(before, "value"));
  const baseAdded = Number(pick(before, "detail", "params", "files", "value"));
  const aged = [];
  for (const [name, days] of [
    ["ancien.png", 31],
    ["recent.png", 29],
    ["neuf.png", 0],
  ]) {
    const file = await uploaded(ctx, {
      folderId: folder.id,
      name: String(name),
      mimetype: "image/png",
      bytes: await image(ctx, { width: 6, height: 6 }),
    });
    if (Number(days) > 0)
      aged.push(
        await age(ctx, "media_assets", file.id, {
          createdAt: Number(days),
          updatedAt: Number(days),
        }),
      );
  }
  const batchIds = [ctx.unique("w25h"), ctx.unique("w23h")];
  for (const [index, failed] of [2, 1].entries())
    await media(
      ctx,
      `report a batch with ${failed} failed`,
      "POST",
      "/upload/batches",
      {
        body: {
          batchId: batchIds[index],
          folderId: folder.id,
          total: failed,
          uploaded: 0,
          failed,
          size: 1,
          failures: Array.from({ length: failed }, (_, index) => ({
            name: `w${index}.html`,
            reason: "type_not_allowed",
          })),
        },
      },
    );
  const reports = list(
    (
      await media(
        ctx,
        "the upload rows",
        "GET",
        "/activity?type=uploads&limit=50",
      )
    ).body,
    "items",
  ).filter((row) => String(pick(row, "title")).includes("upload_batch"));
  const newest = String(pick(reports[0], "id"));
  const older = String(pick(reports[1], "id"));
  aged.push(
    await age(ctx, "media_events", older, { createdAt: 25 / 24 }),
    await age(ctx, "media_events", newest, { createdAt: 23 / 24 }),
  );
  return { before, baseFiles, baseAdded, batchIds, aged };
}

/**
 * Reads the KPIs, Needs attention and the batches, and checks what each window counts.
 *
 * @param {Ctx} ctx The journey context
 * @param {Windows} seeded What the seed left
 * @returns {Promise<void>}
 */
async function verifyWindows(ctx, seeded) {
  const { before, baseFiles, baseAdded, batchIds, aged } = seeded;
  const kpis = await media(ctx, "KPIs", "GET", "/stats/kpis");
  const attention = await media(
    ctx,
    "needs attention",
    "GET",
    "/stats/attention",
  );
  const files = item(kpis.body, "files");
  const rows = list(
    (await media(ctx, "the recent batches", "GET", "/upload/batches")).body,
    "results",
  );
  /** @param {string | undefined} batchId @returns {unknown} */
  const flagOf = (batchId) =>
    pick(
      rows.find((row) => JSON.stringify(row).includes(String(batchId))),
      "attention",
    );
  await ctx.verify("the windows", [
    check(
      "every aged row was found",
      aged.length === 4 && aged.every((count) => count === 1),
      aged,
    ),
    check("Files: three more", pick(files, "value") === baseFiles + 3, [
      before,
      files,
    ]),
    check(
      "added in the last 30 days: two more, the files of 29 days and of today",
      pick(files, "detail", "params", "files", "value") === baseAdded + 2,
      [before, files],
    ),
    check(
      "failed in the last 24 hours: 1, the batch of 23 hours and not the one of 25",
      pick(item(attention.body, "failed-uploads"), "value") === 1,
      item(attention.body, "failed-uploads"),
    ),
    check(
      "Failed today keeps the batch of 23 hours and not the one of 25",
      flagOf(batchIds[1]) === "yes" && flagOf(batchIds[0]) !== "yes",
      [flagOf(batchIds[1]), flagOf(batchIds[0])],
    ),
  ]);
}

/**
 * Checks that the Activity page groups older events under their own day.
 *
 * @param {Ctx} ctx The journey context
 * @returns {Promise<void>}
 */
async function verifyActivityDays(ctx) {
  const tab = await ctx.tab();
  await tab.signIn("admin");
  await tab.goto("/modules/media/activity");
  await tab.visible(
    { role: "heading", name: /^Today · /, level: 3 },
    { timeoutMs: 30_000 },
  );
  const days = await tab.page
    .getByRole("heading", { level: 3 })
    .allTextContents();
  await ctx.verify("older events sit under their own day", [
    check(
      "Today first, then an earlier day",
      days.length >= 2 &&
        days[0]?.startsWith("Today") === true &&
        !String(days[days.length - 1]).startsWith("Today"),
      days,
    ),
  ]);
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theOverviewWindowsCountOnlyRecentRows = {
  id: "the-overview-windows-count-only-recent-rows",
  title:
    "the Files KPI counts the files added in the last 30 days (29 days yes, 31 no), Needs attention and the Uploads page's Failed today tab the uploads failed in the last 24 hours (23 hours yes, 25 no), and the Activity page groups older events under their own day",
  entryPoint:
    "GET /api/media/stats/kpis, /stats/attention, /upload/batches, /modules/media/activity",
  async run(/** @type {Ctx} */ ctx) {
    const seeded = await seedAgedRows(ctx);
    await verifyWindows(ctx, seeded);
    await verifyActivityDays(ctx);
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
