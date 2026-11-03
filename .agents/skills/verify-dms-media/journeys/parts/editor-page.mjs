import { createFolder, folderAssets, uploaded } from "../../library.mjs";
import { check, image, media, pick, SVG } from "../../media.mjs";

/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {import("../../media.mjs").Tab} Tab
 */

/**
 * Reads a file until it shows the given size, for a save the page sends a moment after the click.
 *
 * @param {Ctx} ctx The journey
 * @param {string} id The file
 * @param {(asset: unknown) => boolean} accept Whether the file shows the change
 * @returns {Promise<unknown>} The last read
 */
async function settled(ctx, id, accept) {
  let asset = pick((await media(ctx, "read the file", "GET", `/assets/${id}`)).body, "asset");
  for (let attempt = 0; attempt < 20 && !accept(asset); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    asset = pick((await media(ctx, "read the file again", "GET", `/assets/${id}`)).body, "asset");
  }
  return asset;
}

/**
 * @param {Tab} tab The editor tab
 * @param {string} name The crop field
 * @returns {Promise<string>} Its value
 */
async function field(tab, name) {
  return tab.page.getByRole("spinbutton", { name, exact: true }).inputValue({ timeout: 10_000 }).catch(() => "");
}

/**
 * Rotates right once the editor has hydrated: the page renders on the server and a click before hydration does
 * nothing, so the click is repeated until the rotation shows under Pending changes.
 *
 * @param {Tab} tab The editor tab
 * @returns {Promise<boolean>} Whether the rotation is pending
 */
async function rotateOnce(tab) {
  await tab.page.getByRole("button", { name: "Rotate right" }).waitFor({ timeout: 30_000 }).catch(() => undefined);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await tab.page.getByRole("button", { name: "Rotate right" }).click().catch(() => undefined);
    if (await tab.page.getByText(/Rotate 90°/).first().isVisible({ timeout: 1500 }).catch(() => false)) {
      await tab.page.waitForTimeout(1000);
      return true;
    }
    await tab.page.waitForTimeout(1500);
  }
  return false;
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theEditorCropsRotatesAndSaves = {
  id: "the-editor-crops-rotates-and-saves",
  title: "the editor offers free, original and the six preset ratios, the crop fields, left and right rotation and a preview per image size; nothing is written until Save; Save rotates the file, Revert to original restores it, Save as copy adds the edit beside it",
  entryPoint: "/modules/media/editor?asset=<id>",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Editor"));
    const file = await uploaded(ctx, { folderId: folder.id, name: "large.png", mimetype: "image/png", bytes: await image(ctx, { width: 400, height: 200 }) });
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto(`/modules/media/file?asset=${file.id}`);
    await tab.visible({ role: "button", name: /^Edit image/ }, { timeoutMs: 30_000 });
    await tab.page.getByRole("heading", { level: 1 }).click().catch(() => undefined);
    await tab.press("e");
    const opened = await tab.at(/^\/modules\/media\/editor$/, { timeoutMs: 20_000 });
    await ctx.verify("E opens the editor with its ratios and sizes", [
      opened,
      tab.visible({ role: "heading", name: "Edit large.png", level: 1 }, { timeoutMs: 20_000 }),
      ...["Free", /original/, /^1:1/, "4:5 portrait post", "4:3", "16:9", "9:16 story", "1.91:1 link preview"].map((name) => tab.visible({ role: "radio", name })),
      tab.visible({ role: "button", name: "Rotate left" }),
      tab.visible({ role: "button", name: "Rotate right" }),
      tab.shows(/thumb · 300 × 300/),
      tab.shows(/preview · 1600/),
    ]);
    const hydrated = await rotateOnce(tab);
    const frame = tab.page.getByRole("group", { name: "Crop area" });
    const before = { x: await field(tab, "X"), w: await field(tab, "W") };
    await frame.focus().catch(() => undefined);
    await tab.page.getByRole("radio", { name: /^1:1/ }).first().click({ timeout: 10_000 }).catch(() => undefined);
    await tab.page.waitForTimeout(800);
    const square = { w: await field(tab, "W"), h: await field(tab, "H") };
    await tab.click({ role: "button", name: "Rotate left" });
    const back = await tab.page.getByText(/Rotate 90°/).first().isVisible({ timeout: 2000 }).catch(() => false);
    await ctx.verify("1:1 squares the frame and Rotate left undoes Rotate right", [
      check("the frame is square", square.w !== "" && square.w === square.h, square),
      check("the right quarter turn is no longer pending", !back, back),
    ]);
    await tab.click({ role: "button", name: "Discard" });
    const untouched = await settled(ctx, file.id, () => true);
    await ctx.verify("the frame, and nothing written", [
      check("the rotation is pending", hydrated, hydrated),
      check("the frame starts on the whole rotated image", before.w === "200" && before.x === "0", before),
      check("Discard writes nothing", pick(untouched, "width") === 400 && pick(untouched, "hasOriginal") === false, untouched),
    ]);
    await tab.goto(`/modules/media/editor?asset=${file.id}`);
    await rotateOnce(tab);
    await tab.click({ role: "button", name: /^Save change/ });
    const rotated = await settled(ctx, file.id, (asset) => pick(asset, "width") === 200);
    await ctx.verify("Save rotates the file everywhere", [check("200×400 with its original kept", pick(rotated, "width") === 200 && pick(rotated, "height") === 400 && pick(rotated, "hasOriginal") === true, rotated)]);
    await tab.goto(`/modules/media/editor?asset=${file.id}`);
    await tab.visible({ role: "button", name: "Revert to original" }, { timeoutMs: 20_000 });
    await tab.click({ role: "button", name: "Revert to original" });
    await tab.page.getByRole("button", { name: /^Revert/ }).last().click({ timeout: 5000 }).catch(() => undefined);
    const reverted = await settled(ctx, file.id, (asset) => pick(asset, "width") === 400);
    await ctx.verify("Revert to original restores it", [check("400×200, no original left", pick(reverted, "width") === 400 && pick(reverted, "hasOriginal") === false, reverted)]);
    await tab.goto(`/modules/media/editor?asset=${file.id}`);
    await rotateOnce(tab);
    await tab.click({ role: "button", name: "Save as copy" });
    let listed = await folderAssets(ctx, folder.id);
    for (let attempt = 0; attempt < 20 && listed.assets.length < 2; attempt += 1) {
      await tab.page.waitForTimeout(500);
      listed = await folderAssets(ctx, folder.id);
    }
    const source = await settled(ctx, file.id, () => true);
    const copy = listed.assets.find((asset) => pick(asset, "id") !== file.id);
    await ctx.verify("Save as copy", [check("the rotated copy in the same folder", pick(copy, "width") === 200 && pick(copy, "height") === 400 && pick(copy, "folderId") === folder.id, listed.assets), check("the source untouched", pick(source, "width") === 400 && pick(source, "hasOriginal") === false, source)]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const anSvgIsEditedInADesignTool = {
  id: "an-svg-is-edited-in-a-design-tool",
  title: "the editor of an SVG says it is a vector drawing to edit in a design tool and offers no save",
  entryPoint: "/modules/media/editor?asset=<svg>",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Vector"));
    const file = await uploaded(ctx, { folderId: folder.id, name: "logo.svg", mimetype: "image/svg+xml", bytes: SVG });
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto(`/modules/media/editor?asset=${file.id}`);
    await ctx.verify("no editing of a vector", [tab.shows(/design tool/i, { timeoutMs: 20_000 }), tab.visible({ role: "button", name: /^Save change/ }, { hidden: true })]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theCropFrameFollowsTheArrowKeys = {
  id: "the-crop-frame-follows-the-arrow-keys",
  title: "Shift with an arrow key resizes the crop frame and an arrow key moves it, and Save as copy applies that crop",
  entryPoint: "/modules/media/editor?asset=<id>, crop frame keys",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Frame"));
    const file = await uploaded(ctx, { folderId: folder.id, name: "cadre.png", mimetype: "image/png", bytes: await image(ctx, { width: 400, height: 200 }) });
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto(`/modules/media/editor?asset=${file.id}`);
    await rotateOnce(tab);
    await tab.click({ role: "button", name: "Rotate left" });
    await tab.page.waitForTimeout(800);
    const frame = tab.page.getByRole("group", { name: "Crop area" });
    const before = { x: await field(tab, "X"), w: await field(tab, "W") };
    for (let step = 0; step < 3; step += 1) await frame.press("Shift+ArrowLeft").catch(() => undefined);
    await tab.page.waitForTimeout(500);
    const resized = { x: await field(tab, "X"), w: await field(tab, "W") };
    await frame.press("ArrowRight").catch(() => undefined);
    await tab.page.waitForTimeout(500);
    const moved = { x: await field(tab, "X"), w: await field(tab, "W") };
    await ctx.verify("the frame follows the keys", [
      check("Shift with an arrow key resizes it", Number(resized.w) < Number(before.w), [before, resized]),
      check("an arrow key moves it", Number(moved.x) > Number(resized.x) && moved.w === resized.w, [resized, moved]),
    ]);
    await tab.click({ role: "button", name: "Save as copy" });
    let listed = await folderAssets(ctx, folder.id);
    for (let attempt = 0; attempt < 20 && listed.assets.length < 2; attempt += 1) {
      await tab.page.waitForTimeout(500);
      listed = await folderAssets(ctx, folder.id);
    }
    const copy = listed.assets.find((asset) => pick(asset, "id") !== file.id);
    await ctx.verify("the copy has the frame", [
      check("Save as copy applies the crop", Number(pick(copy, "width")) === Number(moved.w), [moved, copy]),
    ]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aTypedCropIsAPendingChange = {
  id: "a-typed-crop-is-a-pending-change",
  title: "a crop typed in the W field is a pending change that Save as copy applies",
  entryPoint: "/modules/media/editor?asset=<id>, crop fields",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Typed"));
    const file = await uploaded(ctx, { folderId: folder.id, name: "saisie.png", mimetype: "image/png", bytes: await image(ctx, { width: 400, height: 200 }) });
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto(`/modules/media/editor?asset=${file.id}`);
    await rotateOnce(tab);
    await tab.click({ role: "button", name: "Rotate left" });
    await tab.page.waitForTimeout(800);
    await tab.fill({ role: "spinbutton", name: "W" }, "100");
    await tab.press("Enter");
    await tab.page.waitForTimeout(800);
    const pending = !(await tab.page.getByText(/No changes yet/).first().isVisible().catch(() => false));
    await tab.click({ role: "button", name: "Save as copy" });
    let listed = await folderAssets(ctx, folder.id);
    for (let attempt = 0; attempt < 20 && listed.assets.length < 2; attempt += 1) {
      await tab.page.waitForTimeout(500);
      listed = await folderAssets(ctx, folder.id);
    }
    const copy = listed.assets.find((asset) => pick(asset, "id") !== file.id);
    await ctx.verify("the typed crop counts", [check("a typed width is a pending change", pending, pending), check("Save as copy applies it: 100 wide", pick(copy, "width") === 100, copy)]);
  },
};

/**
 * Journeys of the image editor page.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function editorPageJourneys() {
  return [theEditorCropsRotatesAndSaves, anSvgIsEditedInADesignTool, theCropFrameFollowsTheArrowKeys, aTypedCropIsAPendingChange];
}
