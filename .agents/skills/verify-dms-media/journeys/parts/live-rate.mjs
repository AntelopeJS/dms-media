import { createFolder, uploaded } from "../../library.mjs";
import { check, image, media } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/**
 * @param {number[]} times When each read started, in milliseconds
 * @returns {number} The shortest gap between two reads, or Infinity for fewer than two
 */
function shortestGap(times) {
  let shortest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < times.length; index += 1) shortest = Math.min(shortest, Number(times[index]) - Number(times[index - 1]));
  return shortest;
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aBlockReadsAtMostEveryTwoSeconds = {
  id: "a-block-reads-at-most-every-two-seconds",
  title: "while uploads and renames land every few hundred milliseconds, the Overview's KPIs read the library again, but at most once every two seconds",
  entryPoint: "/modules/media/overview, GET /api/media/stats/kpis",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Rate"));
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto("/modules/media/overview");
    await tab.visible({ role: "group", name: "Live updates" }, { timeoutMs: 30_000 });
    await tab.page.waitForTimeout(3000);
    /** @type {Map<string, number[]>} */
    const reads = new Map([["uploads", []], ["renames", []]]);
    let phase = "";
    tab.page.on("request", (request) => {
      if (request.url().includes("/api/media/stats/kpis")) reads.get(phase)?.push(Date.now());
    });
    phase = "uploads";
    for (let index = 0; index < 8; index += 1) {
      await uploaded(ctx, { folderId: folder.id, name: `rate${index}.png`, mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
      await tab.page.waitForTimeout(600);
    }
    await tab.page.waitForTimeout(2500);
    phase = "renames";
    for (let index = 0; index < 15; index += 1) {
      await media(ctx, `rename ${index}`, "POST", `/folders/${folder.id}/rename`, { body: { name: `Rate ${index}` } });
      await tab.page.waitForTimeout(300);
    }
    await tab.page.waitForTimeout(2500);
    phase = "";
    const uploads = reads.get("uploads") ?? [];
    const renames = reads.get("renames") ?? [];
    await ctx.verify("the reads", [
      check("uploads: the KPIs read again, more than once over the uploads", uploads.length >= 2, uploads),
      check("uploads: never twice within two seconds", shortestGap(uploads) >= 1900, shortestGap(uploads)),
      check("renames: the KPIs read again, more than once over the renames", renames.length >= 2, renames),
      check("renames: never twice within two seconds", shortestGap(renames) >= 1900, shortestGap(renames)),
    ]);
  },
};

/**
 * The Overview's live read rate.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function liveRateJourneys() {
  return [aBlockReadsAtMostEveryTwoSeconds];
}
