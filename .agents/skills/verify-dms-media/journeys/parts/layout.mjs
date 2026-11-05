import { createFolder, uploaded } from "../../library.mjs";
import { check, image } from "../../media.mjs";

/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {import("../../media.mjs").Tab} Tab
 */

/**
 * @param {Tab} tab The tab
 * @returns {Promise<number>} The width the explorer lays itself out by: its content box, inside its border and padding
 */
async function explorerWidth(tab) {
  const toggle = tab.page.getByRole("button", { name: "Details panel" }).first();
  const width = await toggle
    .evaluate((element) => {
      const card = element.closest(".dms-card");
      if (!(card instanceof HTMLElement)) return 0;
      const style = getComputedStyle(card);
      return card.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
    })
    .catch(() => 0);
  return Math.round(Number(width));
}

/**
 * Resizes the window until the explorer itself is the given width: the dashboard's sidebar and margins take the rest.
 *
 * @param {Tab} tab The tab
 * @param {number} target The explorer width wanted
 * @returns {Promise<number>} The explorer width reached
 */
async function fitExplorer(tab, target) {
  let windowWidth = target + 400;
  let reached = 0;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await tab.page.setViewportSize({ width: windowWidth, height: 1000 });
    await tab.page.waitForTimeout(600);
    reached = await explorerWidth(tab);
    if (reached === target) break;
    windowWidth += target - reached;
  }
  return reached;
}

/**
 * @param {Tab} tab The tab
 * @returns {Promise<boolean>} Whether the details panel sits beside the files
 */
async function besideTheFiles(tab) {
  return (await tab.page.getByRole("complementary", { name: "Details" }).count()) > 0;
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theDetailsPanelFollowsTheExplorersWidth = {
  id: "the-details-panel-follows-the-explorers-width",
  title: "when the explorer is at least 1000px wide the details panel sits beside the files (1000, 1200 and 1500 px); at 999 px it leaves the side of the files for the DMS drawer, which the-details-drawer-steps-through-the-files opens",
  entryPoint: "/modules/media/files, explorer width",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Largeur"));
    await uploaded(ctx, { folderId: folder.id, name: "a.png", mimetype: "image/png", bytes: await image(ctx, { width: 20, height: 10 }) });
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto(`/modules/media/files?folder=${folder.id}`);
    await tab.visible({ role: "option", name: /^a\.png/ }, { timeoutMs: 30_000 });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await tab.page.getByRole("option", { name: /^a\.png/ }).click().catch(() => undefined);
      if ((await tab.page.getByRole("option", { name: /^a\.png/ }).getAttribute("aria-selected").catch(() => "")) === "true") break;
      await tab.page.waitForTimeout(1500);
    }
    await fitExplorer(tab, 1500);
    for (let attempt = 0; attempt < 3 && !(await besideTheFiles(tab)); attempt += 1) {
      await tab.press("i");
      await tab.page.waitForTimeout(800);
    }
    /** @type {[number, boolean][]} */
    const cases = [[1500, true], [1200, true], [1000, true], [999, false]];
    for (const [width, beside] of cases) {
      const reached = await fitExplorer(tab, width);
      const shown = await besideTheFiles(tab);
      await ctx.verify(`an explorer ${width}px wide`, [check(`the explorer is ${width}px wide`, reached === width, reached), check(beside ? "the details panel sits beside the files" : "the details panel leaves the side of the files", shown === beside, shown)]);
    }
  },
};

/**
 * Journeys of the explorer's layout at the documented widths.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function layoutJourneys() {
  return [theDetailsPanelFollowsTheExplorersWidth];
}
