import { createFolder, folderAssets, setVisibility, tree, uploaded } from "../../library.mjs";
import { readFileSync } from "node:fs";
import { check, image, imageInfo, media, pick, raw, SVG, text, unzip } from "../../media.mjs";

/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {import("../../media.mjs").Tab} Tab
 */

/**
 * A signed-in tab on a Library folder, once its files answer clicks.
 *
 * @param {Ctx} ctx The journey
 * @param {string} folderId The folder
 * @param {RegExp} first A file the folder shows
 * @returns {Promise<Tab>} The tab
 */
async function explorer(ctx, folderId, first) {
  const tab = await ctx.tab();
  await tab.signIn("admin");
  await tab.goto(`/modules/media/files?folder=${folderId}`);
  await tab.visible({ role: "option", name: first }, { timeoutMs: 30_000 });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await tab.page.getByRole("option", { name: first }).click().catch(() => undefined);
    if ((await tab.page.getByRole("option", { name: first }).getAttribute("aria-selected").catch(() => "")) === "true") break;
    await tab.page.waitForTimeout(1500);
  }
  return tab;
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theExplorerShowsViewsLocationsAndThumbnails = {
  id: "the-explorer-shows-views-locations-and-thumbnails",
  title: "the Library lists the views and the folder tree, switches grid, list and columns with a tile size slider, opens a view and a search, and shows images by their thumb size, an SVG by its uncropped preview and a PDF by its type",
  entryPoint: "/modules/media/files",
  async run(/** @type {Ctx} */ ctx) {
    const name = ctx.unique("Explorer");
    const folder = await createFolder(ctx, name);
    const photo = await uploaded(ctx, { folderId: folder.id, name: "vue été.png", mimetype: "image/png", bytes: await image(ctx, { width: 600, height: 300 }) });
    await uploaded(ctx, { folderId: folder.id, name: "logo.svg", mimetype: "image/svg+xml", bytes: SVG });
    await uploaded(ctx, { folderId: folder.id, name: "fiche.pdf", mimetype: "application/pdf", bytes: Buffer.from("%PDF-1.4\n%%EOF\n") });
    await setVisibility(ctx, "assets", photo.id, "public");
    const tab = await explorer(ctx, folder.id, /^vue été\.png/);
    /** @returns {Promise<Record<string, string>>} */
    const readSources = () => tab.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[role="option"]')].map((option) => [option.getAttribute("aria-label") ?? option.textContent ?? "", option.querySelector("img")?.getAttribute("src") ?? ""])));
    let sources = await readSources();
    for (let attempt = 0; attempt < 30 && Object.values(sources).filter((source) => source !== "").length < 2; attempt += 1) {
      await tab.page.waitForTimeout(500);
      sources = await readSources();
    }
    const sourceOf = (/** @type {string} */ prefix) => Object.entries(sources).find(([label]) => label.startsWith(prefix))?.[1] ?? "";
    /** @param {string} prefix @returns {Promise<{ format: string, width: number, height: number }>} */
    const tileImage = async (prefix) => (sourceOf(prefix) === "" ? { format: "", width: 0, height: 0 } : imageInfo(ctx, (await raw(ctx, `read the tile of ${prefix}`, { url: sourceOf(prefix) })).bytes));
    const photoTile = await tileImage("vue été.png");
    const svgTile = await tileImage("logo.svg");
    await ctx.verify("the explorer's parts", [
      ...["Recent", "Starred", "Largest files", "Public", "Missing alt text"].map((view) => tab.visible({ role: "button", name: view })),
      tab.visible({ role: "tree", name: "Locations" }),
      tab.visible({ role: "treeitem", name: new RegExp(`^${name}`) }),
      tab.visible({ role: "slider", name: "Tile size" }),
      check("an image tile shows its thumb size, cropped square", photoTile.width === 300 && photoTile.height === 300, photoTile),
      check("an SVG tile shows its uncropped preview size, 2:1 like the drawing", svgTile.height > 0 && Math.abs(svgTile.width - 2 * svgTile.height) <= 2, svgTile),
      check("a PDF tile shows no image, an icon of its type", sourceOf("fiche.pdf") === "", sources),
      check("a tile image is a signed read URL or a relative /media path, never a publicBaseUrl link", Object.values(sources).every((source) => source === "" || source.startsWith("/media/") || source.includes("token=")) && !Object.values(sources).some((source) => source.startsWith(`${ctx.state.webUrl}/media/`)), sources),
    ]);
    for (const view of ["List", "Columns", "Grid"]) {
      await tab.click({ role: "radio", name: view });
      await ctx.verify(`${view} display`, [tab.visible({ role: "radio", name: view, checked: true })]);
    }
    await tab.goto(`/modules/media/files?folder=${folder.id}&type=pdf`);
    await ctx.verify("a link with a type filter narrows the listing", [tab.visible({ role: "option", name: /^fiche\.pdf/ }, { timeoutMs: 20_000 }), tab.visible({ role: "option", name: /^logo\.svg/ }, { hidden: true })]);
    await tab.goto(`/modules/media/files?folder=${folder.id}&sort=size&direction=desc`);
    await tab.visible({ role: "option", name: /^vue été\.png/ }, { timeoutMs: 20_000 });
    const order = (await tab.page.getByRole("option").allTextContents()).map((label) => label.trim());
    const firstOption = (await tab.page.getByRole("option").first().getAttribute("aria-label")) ?? order[0] ?? "";
    await ctx.verify("a link with a sort orders the listing", [check("the biggest file comes first", firstOption.startsWith("vue été.png") || (order[0] ?? "").includes("vue"), [firstOption, order])]);
    const dropped = await image(ctx, { width: 7, height: 7 });
    await tab.page.locator("body").evaluate((element, base64) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], "deposee.png", { type: "image/png" }));
      const target = document.querySelector('[role="listbox"]') ?? document.body;
      for (const type of ["dragenter", "dragover", "drop"]) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, dropped.toString("base64"));
    let afterDrop = await folderAssets(ctx, folder.id);
    for (let attempt = 0; attempt < 20 && !afterDrop.assets.some((asset) => text(asset, "name") === "deposee.png"); attempt += 1) {
      await tab.page.waitForTimeout(1000);
      afterDrop = await folderAssets(ctx, folder.id);
    }
    await ctx.verify("a drop on the explorer uploads to the current folder", [check("deposee.png is in the folder", afterDrop.assets.some((asset) => text(asset, "name") === "deposee.png"), afterDrop.assets.map((asset) => text(asset, "name")))]);
    await tab.goto(`/modules/media/files?folder=${folder.id}`);
    await tab.visible({ role: "option", name: /^vue été\.png/ }, { timeoutMs: 20_000 });
    await tab.click({ role: "button", name: "Public" });
    await ctx.verify("the Public view", [tab.visible({ role: "option", name: /^vue été\.png/ }, { timeoutMs: 15_000 }), tab.visible({ role: "option", name: /^fiche\.pdf/ }, { hidden: true })]);
    await tab.fill({ role: "textbox", name: "Search the library" }, "fiche");
    await tab.press("Enter");
    await ctx.verify("a search", [tab.visible({ role: "option", name: /^fiche\.pdf/ }, { timeoutMs: 15_000 }), tab.visible({ role: "option", name: /^logo\.svg/ }, { hidden: true }), check("the search is in the link", tab.page.url().includes("q=fiche"), tab.page.url())]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aSelectionIsMovedPublishedZippedAndDeleted = {
  id: "a-selection-is-moved-published-zipped-and-deleted",
  title: "the selection toolbar moves the selected files, makes them public, downloads them as a zip and deletes them; New folder creates a subfolder; the details panel edits the alt text",
  entryPoint: "/modules/media/files selection actions, New folder, details panel",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Selection"));
    const target = await createFolder(ctx, ctx.unique("Selection target"));
    const a = await uploaded(ctx, { folderId: folder.id, name: "un.png", mimetype: "image/png", bytes: await image(ctx, { width: 10, height: 10 }) });
    const b = await uploaded(ctx, { folderId: folder.id, name: "deux.png", mimetype: "image/png", bytes: await image(ctx, { width: 10, height: 10 }) });
    const tab = await explorer(ctx, folder.id, /^deux\.png/);
    await tab.press("Control+a");
    const download = tab.page.waitForEvent("download", { timeout: 30_000 }).catch(() => null);
    await tab.click({ role: "button", name: "Download .zip" });
    const saved = await download;
    const zipPath = saved ? await saved.path() : null;
    const entries = zipPath ? unzip(readFileSync(zipPath)) : [];
    await tab.click({ role: "button", name: "Visibility" });
    const dialog = tab.page.getByRole("dialog", { name: "Visibility of 2 files" });
    await dialog.getByRole("radio", { name: "Public" }).check({ timeout: 10_000 }).catch(() => undefined);
    await dialog.getByRole("button", { name: "Apply to 2 files" }).click({ timeout: 10_000 }).catch(() => undefined);
    await tab.page.getByRole("button", { name: /Make public/ }).last().click({ timeout: 3000 }).catch(() => undefined);
    await tab.page.waitForTimeout(1500);
    const published = await media(ctx, "read un.png", "GET", `/assets/${a.id}`);
    await ctx.verify("zip and visibility", [
      check("the zip holds both files", entries.map((entry) => entry.name).sort().join() === "deux.png,un.png", entries.map((entry) => entry.name)),
      check("the selection is public", pick(published.body, "asset", "visibility") === "public", published.body),
    ]);
    await tab.press("Control+a");
    await tab.click({ role: "button", name: "Move to…" });
    await tab.page.getByRole("dialog").getByText(String(pick((await tree(ctx)).folders.find((row) => pick(row, "id") === target.id), "name"))).first().click({ timeout: 10_000 }).catch(() => undefined);
    await tab.page.getByRole("dialog").getByRole("button", { name: /^Move/ }).last().click({ timeout: 10_000 }).catch(() => undefined);
    let moved = await folderAssets(ctx, target.id);
    for (let attempt = 0; attempt < 10 && moved.assets.length < 2; attempt += 1) {
      await tab.page.waitForTimeout(500);
      moved = await folderAssets(ctx, target.id);
    }
    await ctx.verify("Move to…", [check("both files moved", moved.assets.length === 2, moved.assets.map((asset) => text(asset, "name")))]);
    await tab.goto(`/modules/media/files?folder=${target.id}`);
    await tab.visible({ role: "option", name: /^un\.png/ }, { timeoutMs: 20_000 });
    await tab.page.getByRole("button", { name: "New folder", exact: true }).first().click();
    await tab.page.getByRole("dialog").getByRole("textbox").first().fill("Sous-dossier créé");
    await tab.page.getByRole("dialog").getByRole("button", { name: /Create/ }).last().click({ timeout: 10_000 }).catch(() => undefined);
    await tab.page.waitForTimeout(1500);
    const created = (await tree(ctx)).folders.find((row) => pick(row, "parentId") === target.id);
    await tab.page.setViewportSize({ width: 1900, height: 1000 });
    await tab.page.getByRole("option", { name: /^un\.png/ }).click();
    if ((await tab.page.getByRole("complementary", { name: "Details" }).count()) === 0) await tab.press("i");
    await tab.page.getByRole("complementary", { name: "Details" }).getByRole("textbox", { name: /Alt text/i }).first().fill("Décrit depuis le panneau", { timeout: 10_000 }).catch(() => undefined);
    await tab.press("Tab");
    await tab.page.waitForTimeout(1500);
    const described = await media(ctx, "read un.png again", "GET", `/assets/${a.id}`);
    await tab.press("Control+a");
    await tab.click({ role: "button", name: "Delete" });
    await tab.page.getByRole("button", { name: /^Delete/ }).last().click({ timeout: 10_000 }).catch(() => undefined);
    let gone = await media(ctx, "read deux.png", "GET", `/assets/${b.id}`);
    for (let attempt = 0; attempt < 10 && gone.status !== 404; attempt += 1) {
      await tab.page.waitForTimeout(500);
      gone = await media(ctx, "read deux.png again", "GET", `/assets/${b.id}`);
    }
    await ctx.verify("New folder, alt text and Delete", [
      check("a subfolder was created", text(created, "name") === "Sous-dossier créé", created),
      check("the alt text was saved from the details panel", pick(described.body, "asset", "alt") === "Décrit depuis le panneau", described.body),
      check("the selection was deleted", gone.status === 404, gone.status),
    ]);
  },
};

/**
 * Journeys of the Library page's explorer.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function explorerJourneys() {
  return [theExplorerShowsViewsLocationsAndThumbnails, aSelectionIsMovedPublishedZippedAndDeleted];
}
