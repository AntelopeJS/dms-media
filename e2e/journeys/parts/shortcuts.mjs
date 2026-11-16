import { openFilePicker } from "../../chooser.mjs";
import { createFolder, uploaded } from "../../library.mjs";
import { check, image, media, pick } from "../../media.mjs";

/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {import("../../media.mjs").Tab} Tab
 */

/**
 * Opens a Library folder holding three images and a subfolder, and waits until the explorer answers keys.
 *
 * @param {Ctx} ctx The journey
 * @returns {Promise<{ tab: Tab, folderId: string, parentId: string, ids: string[] }>} The tab and the files
 */
async function explorerWithFiles(ctx) {
  const parent = await createFolder(ctx, ctx.unique("Keys parent"));
  const folder = await createFolder(ctx, "Clavier", { parentId: parent.id });
  const ids = [];
  for (const name of ["a.png", "b.png", "c.png"]) ids.push((await uploaded(ctx, { folderId: folder.id, name, mimetype: "image/png", bytes: await image(ctx, { width: 20, height: 10 }) })).id);
  const tab = await ctx.tab();
  await tab.signIn("admin");
  await tab.goto(`/modules/media/files?folder=${folder.id}`);
  await tab.visible({ role: "option", name: /^a\.png/ }, { timeoutMs: 30_000 });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await tab.page.getByRole("option", { name: /^a\.png/ }).click().catch(() => undefined);
    if ((await tab.page.getByRole("option", { name: /^a\.png/ }).getAttribute("aria-selected").catch(() => "")) === "true") break;
    await tab.page.waitForTimeout(1500);
  }
  return { tab, folderId: folder.id, parentId: parent.id, ids };
}

/**
 * @param {Tab} tab The tab
 * @returns {Promise<string[]>} The names of the selected files
 */
async function selected(tab) {
  const options = tab.page.getByRole("option", { selected: true });
  return (await options.allTextContents().catch(() => [])).map((label) => label.trim());
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theDetailsDrawerStepsThroughTheFiles = {
  id: "the-details-drawer-steps-through-the-files",
  title: "narrower than 1000px the details open in the DMS drawer, whose previous and next buttons and J and K keys step through the files shown",
  entryPoint: "/modules/media/files details drawer",
  async run(/** @type {Ctx} */ ctx) {
    const { tab } = await explorerWithFiles(ctx);
    await tab.press("i");
    await ctx.verify("the drawer is headed by the file and its place", [tab.visible({ role: "dialog", name: "Details" }, { timeoutMs: 10_000 }), tab.shows(/a\.png[\s\S]*1 of 3/)]);
    await tab.press("j");
    await ctx.verify("J steps to the next file", [tab.shows(/b\.png[\s\S]*2 of 3/, { timeoutMs: 10_000 })]);
    await tab.press("k");
    await ctx.verify("K steps back", [tab.shows(/a\.png[\s\S]*1 of 3/, { timeoutMs: 10_000 })]);
    await tab.page.getByRole("dialog", { name: "Details" }).getByRole("button", { name: /Next/ }).click({ timeout: 10_000 }).catch(() => undefined);
    await ctx.verify("its next button steps too", [tab.shows(/b\.png[\s\S]*2 of 3/, { timeoutMs: 10_000 })]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const shortcutsSelectAndView = {
  id: "shortcuts-select-and-view",
  title: "← → move between files, Shift ↓ extends the selection, Ctrl Space ticks a file, Ctrl A selects all, Escape clears, 1 2 3 switch grid, list and columns, I toggles the details panel, Enter opens the details, Space previews, ? lists every shortcut, and none fires while typing in a field",
  entryPoint: "/modules/media/files keyboard",
  async run(/** @type {Ctx} */ ctx) {
    const { tab, folderId } = await explorerWithFiles(ctx);
    await tab.page.setViewportSize({ width: 1900, height: 1000 });
    await tab.page.waitForTimeout(1000);
    const besideBefore = await tab.page.getByRole("complementary", { name: "Details" }).count();
    await tab.press("i");
    await tab.page.waitForTimeout(1000);
    const besideAfter = await tab.page.getByRole("complementary", { name: "Details" }).count();
    await tab.press("i");
    await tab.page.waitForTimeout(1000);
    const besideBack = await tab.page.getByRole("complementary", { name: "Details" }).count();
    await ctx.verify("at least 1000px wide, I toggles the details panel beside the files", [check("the side panel toggles and back", besideBefore !== besideAfter && besideBack === besideBefore, [besideBefore, besideAfter, besideBack]), tab.visible({ role: "dialog", name: "Details" }, { hidden: true })]);
    await tab.page.getByRole("option", { name: /^a\.png/ }).click();
    await tab.press("ArrowRight");
    const afterRight = await selected(tab);
    await tab.press("ArrowLeft");
    const afterLeft = await selected(tab);
    await tab.press("Shift+ArrowDown");
    await tab.press("Shift+ArrowRight");
    const extended = await selected(tab);
    await tab.press("Escape");
    const cleared = await selected(tab);
    await tab.press("Control+a");
    const all = await selected(tab);
    await tab.press("Escape");
    await ctx.verify("selection keys", [
      check("→ selects the next file", afterRight.length === 1 && afterRight[0]?.startsWith("b.png") === true, afterRight),
      check("← goes back", afterLeft.length === 1 && afterLeft[0]?.startsWith("a.png") === true, afterLeft),
      check("Shift extends the selection", extended.length >= 2, extended),
      check("Escape clears it", cleared.length === 0, cleared),
      check("Ctrl A selects all", all.length === 3, all),
    ]);
    await tab.page.getByRole("option", { name: /^c\.png/ }).click();
    await tab.press("Control+Space");
    const ticked = await selected(tab);
    await ctx.verify("Ctrl Space toggles a file", [check("c.png is unticked", !ticked.some((name) => name.startsWith("c.png")), ticked)]);
    for (const [key, view] of [["2", "List"], ["3", "Columns"], ["1", "Grid"]]) {
      await tab.press(String(key));
      await ctx.verify(`${key} shows ${view}`, [tab.visible({ role: "radio", name: String(view), checked: true }, { timeoutMs: 5000 })]);
    }
    await tab.page.getByRole("option", { name: /^a\.png/ }).click();
    await tab.press("Space");
    await ctx.verify("Space previews", [tab.visible({ role: "dialog" }, { timeoutMs: 10_000 })]);
    await tab.press("Escape");
    await tab.press("Enter");
    await ctx.verify("Enter opens the file's details page", [tab.at(/^\/modules\/media\/file$/, { timeoutMs: 10_000 }), tab.visible({ role: "heading", name: "a.png", level: 1 })]);
    await tab.goto(`/modules/media/files?folder=${folderId}`);
    await tab.visible({ role: "option", name: /^a\.png/ }, { timeoutMs: 20_000 });
    await tab.page.getByRole("option", { name: /^a\.png/ }).click();
    await tab.page.keyboard.press("Shift+Slash");
    await ctx.verify("? lists every shortcut", [tab.visible({ role: "dialog" }, { timeoutMs: 10_000 }), tab.shows(/Extend the selection/i), tab.shows(/New folder/i)]);
    await tab.press("Escape");
    await tab.press("Control+/");
    const focused = await tab.page.getByRole("textbox", { name: "Search the library" }).evaluate((element) => element === document.activeElement).catch(() => false);
    await tab.page.keyboard.type("2");
    await ctx.verify("Ctrl / searches, and keys typed there are text", [check("the search has focus", focused, focused), tab.visible({ role: "radio", name: "Grid", checked: true })]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const shortcutsActOnFilesAndFolders = {
  id: "shortcuts-act-on-files-and-folders",
  title: "Ctrl ↑ opens the parent folder, U opens the file picker, Shift N a new folder, F2 renames, M moves, Delete deletes and E opens the image editor",
  entryPoint: "/modules/media/files keyboard",
  async run(/** @type {Ctx} */ ctx) {
    const { tab, folderId, parentId, ids } = await explorerWithFiles(ctx);
    const picker = await openFilePicker(tab, () => tab.press("u"), 5000);
    const picks = picker.clicks;
    const dialogsAfterU = await tab.page.getByRole("dialog").count();
    await ctx.verify("U opens the file picker", [check("U clicks the explorer's file input once, which opens the browser's file picker", picks === 1, picks), check("and no destination dialog opens instead", dialogsAfterU === 0, dialogsAfterU)]);
    await tab.press("Shift+N");
    await ctx.verify("Shift N opens the new folder dialog", [tab.visible({ role: "dialog" }, { timeoutMs: 10_000 })]);
    await tab.press("Escape");
    await tab.page.getByRole("option", { name: /^a\.png/ }).click();
    await tab.press("F2");
    await ctx.verify("F2 opens the rename field", [tab.visible({ role: "textbox", name: /name/i }, { timeoutMs: 10_000 })]);
    await tab.page.getByRole("textbox", { name: /name/i }).last().fill("renomme");
    await tab.press("Enter");
    let renamed = await media(ctx, "read a.png after F2", "GET", `/assets/${ids[0]}`);
    for (let attempt = 0; attempt < 10 && !String(pick(renamed.body, "asset", "name")).startsWith("renomme"); attempt += 1) {
      await tab.page.waitForTimeout(500);
      renamed = await media(ctx, "read a.png again", "GET", `/assets/${ids[0]}`);
    }
    await ctx.verify("F2 renames", [check("the file is renamed", String(pick(renamed.body, "asset", "name")).startsWith("renomme"), renamed.body)]);
    await tab.page.getByRole("option", { name: /^b\.png/ }).click();
    await tab.press("m");
    await ctx.verify("M opens the move dialog", [tab.visible({ role: "dialog" }, { timeoutMs: 10_000 }), tab.shows(/Move/)]);
    const dialog = tab.page.getByRole("dialog");
    await dialog.getByText("Keys parent", { exact: false }).first().click({ timeout: 10_000 }).catch(() => undefined);
    await dialog.getByRole("button", { name: /^Move/ }).last().click({ timeout: 10_000 }).catch(() => undefined);
    let moved = await media(ctx, "read b.png after M", "GET", `/assets/${ids[1]}`);
    for (let attempt = 0; attempt < 10 && pick(moved.body, "asset", "folderId") !== parentId; attempt += 1) {
      await tab.page.waitForTimeout(500);
      moved = await media(ctx, "read b.png again", "GET", `/assets/${ids[1]}`);
    }
    await ctx.verify("M moves", [check("b.png is in the parent folder", pick(moved.body, "asset", "folderId") === parentId, moved.body)]);
    await tab.goto(`/modules/media/files?folder=${folderId}`);
    await tab.visible({ role: "option", name: /^c\.png/ }, { timeoutMs: 20_000 });
    await tab.page.getByRole("option", { name: /^c\.png/ }).click();
    await tab.press("Delete");
    await tab.page.getByRole("button", { name: /^Delete/ }).last().click({ timeout: 10_000 }).catch(() => undefined);
    let gone = await media(ctx, "read c.png", "GET", `/assets/${ids[2]}`);
    for (let attempt = 0; attempt < 10 && gone.status !== 404; attempt += 1) {
      await tab.page.waitForTimeout(500);
      gone = await media(ctx, "read c.png again", "GET", `/assets/${ids[2]}`);
    }
    await ctx.verify("Delete deletes", [check("c.png is gone", gone.status === 404, pick(gone.body, "asset"))]);
    await tab.page.getByRole("option", { name: /^renomme/ }).click();
    await tab.press("e");
    await ctx.verify("E opens the editor", [tab.at(/^\/modules\/media\/editor$/, { timeoutMs: 15_000 })]);
    await tab.goto(`/modules/media/files?folder=${parentId}`);
    await tab.goto(`/modules/media/files?folder=${parentId}`);
    await tab.page.getByRole("button", { name: /^Clavier/ }).dblclick({ timeout: 15_000 }).catch(() => undefined);
    await tab.visible({ role: "option", name: /^a\.png/ }, { timeoutMs: 15_000 });
    await tab.press("Control+ArrowUp");
    await tab.page.waitForTimeout(1500);
    await ctx.verify("Ctrl ↑ opens the parent folder", [check("the parent is in the URL", tab.page.url().includes(`folder=${parentId}`), tab.page.url())]);
  },
};

/**
 * Journeys of the explorer's keyboard shortcuts.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function shortcutJourneys() {
  return [theDetailsDrawerStepsThroughTheFiles, shortcutsSelectAndView, shortcutsActOnFilesAndFolders];
}
