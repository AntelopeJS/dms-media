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
 * Journeys of the Overview's clock.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function overviewFigureJourneys() {
  return [theCleanUpAndTheToolbarTellTheTime];
}
