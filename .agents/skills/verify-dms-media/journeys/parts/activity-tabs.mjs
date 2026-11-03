import { createFolder, setVisibility, uploaded } from "../../library.mjs";
import { check, image, list, media, pick } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/** The Activity tabs, their `type` filter, and the folder event each must keep or leave out. */
const TABS = [
  { tab: "Uploads", type: "uploads", keeps: [], leaves: ["folder_delete", "folder_move", "folder_visibility_public"] },
  { tab: "Moves", type: "moves", keeps: ["folder_move"], leaves: ["folder_delete", "folder_visibility_public"] },
  { tab: "Deletions", type: "deletions", keeps: ["folder_delete"], leaves: ["folder_move", "folder_visibility_public"] },
  { tab: "Visibility", type: "visibility", keeps: ["folder_visibility_public"], leaves: ["folder_delete", "folder_move"] },
  { tab: "Folders", type: "folders", keeps: ["folder_delete", "folder_move", "folder_visibility_public"], leaves: [] },
];

/**
 * @param {Ctx} ctx The journey
 * @param {string} type An Activity filter
 * @returns {Promise<string[]>} The event keys of its rows, such as `folder_delete`
 */
async function keysOf(ctx, type) {
  const items = list((await media(ctx, `activity ${type}`, "GET", `/activity?type=${type}`)).body, "items");
  return items.map((row) => String(pick(row, "title")).split(".").pop() ?? "");
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const eachTabKeepsItsFolderEvents = {
  id: "each-activity-tab-keeps-its-folder-events",
  title: "a deleted folder is listed under Deletions and Folders and under no other tab, a moved folder under Moves and Folders, a folder made public under Visibility and Folders; Uploads keeps none of them",
  entryPoint: "/modules/media/activity tabs, GET /api/media/activity?type=",
  async run(/** @type {Ctx} */ ctx) {
    const stamp = ctx.unique("Tab");
    const home = await createFolder(ctx, `${stamp} home`);
    await uploaded(ctx, { folderId: home.id, name: "onglet.png", mimetype: "image/png", bytes: await image(ctx, { width: 8, height: 8 }) });
    const doomed = await createFolder(ctx, `${stamp} doomed`);
    const travelling = await createFolder(ctx, `${stamp} travelling`);
    const shown = await createFolder(ctx, `${stamp} shown`);
    await media(ctx, "delete a folder", "DELETE", `/folders/${doomed.id}`);
    await media(ctx, "move a folder", "POST", `/folders/${travelling.id}/move`, { body: { parentId: home.id } });
    await setVisibility(ctx, "folders", shown.id, "public");
    const checks = [];
    for (const row of TABS) {
      const keys = await keysOf(ctx, row.type);
      for (const key of row.keeps) checks.push(check(`${row.tab} lists ${key}`, keys.includes(key), keys));
      for (const key of row.leaves) checks.push(check(`${row.tab} leaves out ${key}`, !keys.includes(key), keys));
    }
    await ctx.verify("each filter keeps exactly its folder events", checks);
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto("/modules/media/activity");
    await tab.visible({ role: "tab", name: "Deletions" }, { timeoutMs: 30_000 });
    const texts = new Map([
      ["folder_delete", new RegExp(`deleted the folder ${stamp} doomed`)],
      ["folder_move", new RegExp(`moved the folder ${stamp} travelling`)],
      ["folder_visibility_public", new RegExp(`made the folder ${stamp} shown public`)],
    ]);
    /** @param {string} key @returns {RegExp} */
    const textOf = (key) => texts.get(key) ?? new RegExp(`no text for ${key}`);
    for (const row of TABS.filter((entry) => entry.tab !== "Folders")) {
      await tab.click({ role: "tab", name: row.tab });
      await tab.page.waitForTimeout(1000);
      await ctx.verify(`the ${row.tab} tab`, [
        ...row.keeps.map((key) => tab.shows(textOf(key), { timeoutMs: 15_000 })),
        ...row.leaves.map((key) => tab.shows(textOf(key), { not: true, timeoutMs: 3000 })),
      ]);
    }
  },
};

/**
 * Journeys of the Activity tabs, one folder event each.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function activityTabJourneys() {
  return [eachTabKeepsItsFolderEvents];
}
