import { createFolder, uploaded } from "../../library.mjs";
import { check, list, media, text } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/** Uploaded in this order, so that neither the size order, the name order nor the upload order is another's. */
const FILES = [
  { name: "d-medium.txt", size: 1500 },
  { name: "a-small.txt", size: 100 },
  { name: "b-large.txt", size: 3000 },
  { name: "c-tiny.txt", size: 10 },
];

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aSortReplacesTheOrderOfALargestOrRecentView = {
  id: "a-sort-replaces-the-order-of-a-largest-or-recent-view",
  title: "the Largest files view lists the biggest file first and Recent the newest, and a sort in the query replaces that order, whatever the direction: the ids come back in exactly the order asked",
  entryPoint: "GET /api/media/views/:view?sort=&direction=",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("View order"));
    /** @type {Map<string, string>} */
    const nameOf = new Map();
    for (const file of FILES) {
      const done = await uploaded(ctx, { folderId: folder.id, name: file.name, mimetype: "text/plain", bytes: Buffer.alloc(file.size, 97) });
      nameOf.set(done.id, file.name);
    }
    /** @param {string} view @param {string} query @returns {Promise<string[]>} The names of the files, in the order the view lists them */
    const order = async (view, query) => {
      const answer = await media(ctx, `${view}${query}`, "GET", `/views/${view}?folderId=${folder.id}${query}`);
      return list(answer.body, "assets").map((row) => nameOf.get(text(row, "id")) ?? text(row, "id"));
    };
    /** @param {string} view @param {string} query @param {string[]} expected @returns {Promise<import("../../media.mjs").Check>} */
    const lists = async (view, query, expected) => {
      const found = await order(view, query);
      return check(`${view}${query || " with no query"} lists ${expected.join(", ")}`, JSON.stringify(found) === JSON.stringify(expected), found);
    };
    await ctx.verify("a view keeps its own order until a sort is asked", [
      await lists("largest", "", ["b-large.txt", "d-medium.txt", "a-small.txt", "c-tiny.txt"]),
      await lists("recent", "", ["c-tiny.txt", "b-large.txt", "a-small.txt", "d-medium.txt"]),
    ]);
    await ctx.verify("a sort replaces the order of the Largest files view", [
      await lists("largest", "&sort=name", ["a-small.txt", "b-large.txt", "c-tiny.txt", "d-medium.txt"]),
      await lists("largest", "&sort=name&direction=desc", ["d-medium.txt", "c-tiny.txt", "b-large.txt", "a-small.txt"]),
      await lists("largest", "&sort=size&direction=asc", ["c-tiny.txt", "a-small.txt", "d-medium.txt", "b-large.txt"]),
      await lists("largest", "&sort=date&direction=asc", ["d-medium.txt", "a-small.txt", "b-large.txt", "c-tiny.txt"]),
    ]);
    await ctx.verify("a sort replaces the order of the Recent view", [
      await lists("recent", "&sort=name", ["a-small.txt", "b-large.txt", "c-tiny.txt", "d-medium.txt"]),
      await lists("recent", "&sort=size&direction=desc", ["b-large.txt", "d-medium.txt", "a-small.txt", "c-tiny.txt"]),
    ]);
  },
};

/**
 * Journeys of the order a smart view lists its files in.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function viewSortJourneys() {
  return [aSortReplacesTheOrderOfALargestOrRecentView];
}
