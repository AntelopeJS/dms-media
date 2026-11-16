import { createFolder, folderAssets, uploaded } from "../../library.mjs";
import { check, image, pick } from "../../media.mjs";
import { field, rotateOnce } from "./editor-page.mjs";

/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {import("../../media.mjs").Tab} Tab
 */

/**
 * Drags with the mouse from the centre of an element by an offset, in small steps as a hand would.
 *
 * @param {Tab} tab The editor tab
 * @param {string} selector The element grabbed
 * @param {number} dx Pixels to the right
 * @returns {Promise<boolean>} Whether the element was there to grab
 */
async function drag(tab, selector, dx) {
  const box = await tab.page.locator(selector).first().boundingBox().catch(() => null);
  if (!box) return false;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await tab.page.mouse.move(x, y);
  await tab.page.mouse.down();
  await tab.page.mouse.move(x + dx, y, { steps: 12 });
  await tab.page.mouse.up();
  await tab.page.waitForTimeout(600);
  return true;
}

/**
 * @param {Tab} tab The editor tab
 * @returns {Promise<{ x: number, w: number }>} The crop frame's X and W fields
 */
async function frameOf(tab) {
  return { x: Number(await field(tab, "X")), w: Number(await field(tab, "W")) };
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theCropFrameFollowsThePointer = {
  id: "the-crop-frame-follows-the-pointer",
  title: "dragging the crop frame with the mouse moves it, dragging its right handle resizes it, and Save as copy applies the dragged frame",
  entryPoint: "/modules/media/editor?asset=<id>, crop frame with a pointer",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Pointer"));
    const file = await uploaded(ctx, { folderId: folder.id, name: "souris.png", mimetype: "image/png", bytes: await image(ctx, { width: 400, height: 200 }) });
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.page.setViewportSize({ width: 1600, height: 1000 });
    await tab.goto(`/modules/media/editor?asset=${file.id}`);
    await rotateOnce(tab);
    await tab.click({ role: "button", name: "Rotate left" });
    await tab.page.waitForTimeout(800);
    await tab.fill({ role: "spinbutton", name: "W" }, "200");
    await tab.press("Enter");
    await tab.page.waitForTimeout(800);
    const start = await frameOf(tab);
    const grabbed = await drag(tab, ".vue-rectangle-stencil", 60);
    const moved = await frameOf(tab);
    const handle = await drag(tab, ".vue-handler-wrapper--east", -40);
    const resized = await frameOf(tab);
    await ctx.verify("the frame follows the pointer", [
      check("the frame and its handle were there to grab", grabbed && handle, [grabbed, handle]),
      check("dragging the frame to the right moves it and keeps its width", moved.x > start.x && moved.w === start.w, [start, moved]),
      check("dragging the right handle to the left narrows it and keeps its left edge", resized.w < moved.w && resized.x === moved.x, [moved, resized]),
    ]);
    await tab.click({ role: "button", name: "Save as copy" });
    let listed = await folderAssets(ctx, folder.id);
    for (let attempt = 0; attempt < 20 && listed.assets.length < 2; attempt += 1) {
      await tab.page.waitForTimeout(500);
      listed = await folderAssets(ctx, folder.id);
    }
    const copy = listed.assets.find((asset) => pick(asset, "id") !== file.id);
    await ctx.verify("the copy has the dragged frame", [check("Save as copy is as wide as the dragged frame", Number(pick(copy, "width")) === resized.w, [resized, copy])]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const eachRatioSetsTheFrameProportions = {
  id: "each-ratio-sets-the-frame-proportions",
  title: "each aspect ratio gives the crop frame its proportions: the original ratio, 1:1, 4:5, 4:3, 16:9, 9:16 and 1.91:1",
  entryPoint: "/modules/media/editor?asset=<id>, Aspect ratio",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Ratios"));
    const file = await uploaded(ctx, { folderId: folder.id, name: "ratios.png", mimetype: "image/png", bytes: await image(ctx, { width: 1200, height: 800 }) });
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto(`/modules/media/editor?asset=${file.id}`);
    await rotateOnce(tab);
    await tab.click({ role: "button", name: "Rotate left" });
    await tab.page.waitForTimeout(800);
    /** @type {[string | RegExp, number][]} */
    const ratios = [[/original/, 1.5], [/^1:1/, 1], ["4:5 portrait post", 0.8], ["4:3", 4 / 3], ["16:9", 16 / 9], ["9:16 story", 9 / 16], ["1.91:1 link preview", 1.91]];
    const checks = [];
    for (const [name, ratio] of ratios) {
      await tab.page.getByRole("radio", { name }).first().click({ timeout: 10_000 }).catch(() => undefined);
      await tab.page.waitForTimeout(700);
      const { w } = await frameOf(tab);
      const h = Number(await field(tab, "H"));
      checks.push(check(`${String(name)}: W/H is ${ratio.toFixed(3)}`, h > 0 && Math.abs(w / h - ratio) <= 0.02, [w, h]));
    }
    await ctx.verify("the frame takes each ratio", checks);
  },
};

/**
 * Journeys of the editor's crop frame under a pointer.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function editorPointerJourneys() {
  return [theCropFrameFollowsThePointer, eachRatioSetsTheFrameProportions];
}
