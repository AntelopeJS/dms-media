import { createFolder, uploaded } from "../../library.mjs";
import { check, image, list, media, pick } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theHistoryListsEveryEvent = {
  id: "the-history-lists-every-event",
  title: "a file's History lists every event of the file, from its upload on: 55 renames and the upload give 56 entries, the upload last",
  entryPoint: "GET /api/media/assets/:id/history",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("History"));
    const file = await uploaded(ctx, { folderId: folder.id, name: "h0.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
    for (let index = 1; index <= 55; index += 1) await media(ctx, `rename ${index}`, "POST", `/assets/${file.id}/update`, { body: { name: `h${index}.png` } });
    const history = await media(ctx, "the file's history", "GET", `/assets/${file.id}/history`);
    const items = list(history.body, "items");
    const last = items[items.length - 1];
    await ctx.verify("every event", [
      check("56 entries: the upload and 55 renames", items.length === 56, items.length),
      check("the upload is the oldest", String(pick(last, "title")).includes("asset_upload"), last),
    ]);
  },
};

/**
 * Journeys of a file's History.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function historyJourneys() {
  return [theHistoryListsEveryEvent];
}
