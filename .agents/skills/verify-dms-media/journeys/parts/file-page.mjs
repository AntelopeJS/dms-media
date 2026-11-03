import { readFileSync } from "node:fs";
import { createFolder, uploaded } from "../../library.mjs";
import { check, image, media, pick, sha256 } from "../../media.mjs";

/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {import("../../media.mjs").Tab} Tab
 */

/**
 * Clicks a button until what it should open shows, while the server-rendered page hydrates.
 *
 * @param {Tab} tab The tab
 * @param {import("playwright-core").Locator} button The button
 * @param {() => Promise<boolean>} opened Whether the click took effect
 * @returns {Promise<boolean>} Whether it did
 */
export async function clickUntil(tab, button, opened) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await button.click({ timeout: 10_000 }).catch(() => undefined);
    for (let poll = 0; poll < 6; poll += 1) {
      if (await opened()) return true;
      await tab.page.waitForTimeout(500);
    }
  }
  return false;
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theFilePageHeaderStepsThroughTheFolder = {
  id: "the-file-page-header-steps-through-the-folder",
  title: "the file page names the file and its place in the folder, its arrows and the ← → keys open the previous and next file, Copy link copies the stable link, Download saves the bytes, and Edit image shows for an image only",
  entryPoint: "/modules/media/file?asset=<id>",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Pages"));
    const bytes = await image(ctx, { width: 30, height: 20 });
    const a = await uploaded(ctx, { folderId: folder.id, name: "a été.png", mimetype: "image/png", bytes });
    const b = await uploaded(ctx, { folderId: folder.id, name: "b.png", mimetype: "image/png", bytes: await image(ctx, { width: 30, height: 20 }) });
    const c = await uploaded(ctx, { folderId: folder.id, name: "c.pdf", mimetype: "application/pdf", bytes: Buffer.from("%PDF-1.4\n%%EOF\n") });
    const tab = await ctx.tab();
    await tab.page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: ctx.state.webUrl });
    await tab.signIn("admin");
    await tab.goto(`/modules/media/file?asset=${b.id}`);
    await ctx.verify("the header", [
      tab.visible({ role: "heading", name: "b.png", level: 1 }, { timeoutMs: 30_000 }),
      tab.shows(/2 of 3/),
      tab.visible({ role: "button", name: "Copy link" }),
      tab.visible({ role: "button", name: "Download" }),
      tab.visible({ role: "button", name: /^Edit image/ }),
    ]);
    const toNext = await clickUntil(tab, tab.page.getByRole("button", { name: "Next file" }), () => tab.page.getByRole("heading", { name: "c.pdf", level: 1 }).isVisible());
    await ctx.verify("Next file opens the next one, a PDF without Edit image", [check("c.pdf", toNext, tab.page.url()), check("the URL names it", tab.page.url().includes(c.id), tab.page.url()), tab.visible({ role: "button", name: /^Edit image/ }, { hidden: true })]);
    await tab.press("ArrowLeft");
    await tab.press("ArrowLeft");
    await ctx.verify("← twice opens the first file", [tab.visible({ role: "heading", name: "a été.png", level: 1 }, { timeoutMs: 15_000 })]);
    await tab.press("ArrowRight");
    await ctx.verify("→ opens the next", [tab.visible({ role: "heading", name: "b.png", level: 1 }, { timeoutMs: 15_000 })]);
    await tab.goto(`/modules/media/file?asset=${a.id}`);
    await tab.visible({ role: "button", name: "Copy link" }, { timeoutMs: 20_000 });
    const copied = await clickUntil(tab, tab.page.getByRole("button", { name: "Copy link" }), async () => (await tab.page.evaluate(() => navigator.clipboard.readText()).catch(() => "")).includes("/media/"));
    const clipboard = await tab.page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
    const download = tab.page.waitForEvent("download", { timeout: 30_000 }).catch(() => null);
    await tab.page.getByRole("button", { name: "Download" }).click();
    const saved = await download;
    const savedPath = saved ? await saved.path() : null;
    await ctx.verify("Copy link and Download", [
      check("Copy link copies the stable link on the public origin", copied && clipboard === `${ctx.state.webUrl}/media/${a.id}/${encodeURIComponent("a été.png")}`, clipboard),
      check("Download saves the file's bytes", savedPath !== null && sha256(readFileSync(savedPath)) === sha256(bytes), savedPath),
    ]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theFileTabsEditAndShowTheFile = {
  id: "the-file-tabs-edit-and-show-the-file",
  title: "Details edits the name and alt text and offers Move… and three visibility choices, Delivery lists the stable links, History the events from the upload on, and Usage says usage is not tracked",
  entryPoint: "/modules/media/file?asset=<id> tabs",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Tabs page"));
    const file = await uploaded(ctx, { folderId: folder.id, name: "photo.png", mimetype: "image/png", bytes: await image(ctx, { width: 30, height: 20 }) });
    const tab = await ctx.tab();
    await tab.page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: ctx.state.webUrl });
    await tab.signIn("admin");
    await tab.goto(`/modules/media/file?asset=${file.id}`);
    await tab.visible({ role: "textbox", name: "Alt text" }, { timeoutMs: 30_000 });
    await ctx.verify("the Details tab", [
      tab.visible({ role: "textbox", name: "Name" }),
      tab.visible({ role: "button", name: "Move…" }),
      tab.visible({ role: "radio", name: /^Same as folder/ }),
      tab.visible({ role: "radio", name: /^Public/ }),
      tab.visible({ role: "radio", name: /^Private/ }),
      tab.shows(/links expire in 5 min/),
      tab.shows(/Links keep working after a rename/),
    ]);
    await tab.fill({ role: "textbox", name: "Alt text" }, "Façade au crépuscule");
    await tab.press("Tab");
    await tab.click({ role: "radio", name: /^Public/ });
    await ctx.verify("making a file public asks first", [tab.visible({ role: "dialog", name: "Make photo.png public?" })]);
    await tab.click({ role: "button", name: "Make public" });
    let read = await media(ctx, "read the file", "GET", `/assets/${file.id}`);
    for (let attempt = 0; attempt < 20 && (pick(read.body, "asset", "alt") !== "Façade au crépuscule" || pick(read.body, "asset", "visibility") !== "public"); attempt += 1) {
      await tab.page.waitForTimeout(500);
      read = await media(ctx, "read the file again", "GET", `/assets/${file.id}`);
    }
    await ctx.verify("the changes are saved", [check("the alt text", pick(read.body, "asset", "alt") === "Façade au crépuscule", read.body), check("the visibility", pick(read.body, "asset", "visibility") === "public", read.body)]);
    await tab.click({ role: "tab", name: /^Delivery/ });
    const panel = tab.page.getByRole("tabpanel", { name: /^Delivery/ });
    await clickUntil(tab, panel.getByRole("button", { name: "Copy" }).first(), async () => (await tab.page.evaluate(() => navigator.clipboard.readText()).catch(() => "")).includes("/media/"));
    const copied = await tab.page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
    await ctx.verify("the Delivery tab", [
      tab.shows(new RegExp(`/media/${file.id}/photo\\.png`), { timeoutMs: 15_000 }),
      tab.shows(new RegExp(`/media/${file.id}/thumb/`)),
      tab.shows(new RegExp(`/media/${file.id}/preview/`)),
      check("the copied stable link starts with the public origin", copied === `${ctx.state.webUrl}/media/${file.id}/photo.png`, copied),
    ]);
    await tab.click({ role: "tab", name: /^History/ });
    await ctx.verify("the History tab", [tab.shows(/uploaded|Uploaded/, { timeoutMs: 15_000 }), tab.shows(/visib|public|Public/)]);
    await tab.click({ role: "tab", name: /^Usage/ });
    await ctx.verify("the Usage tab", [tab.shows(/isn't tracked yet/i, { timeoutMs: 15_000 }), tab.shows(/Check them before you delete or make the file private/)]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aFilePageWithoutAnAssetOpensTheLibrary = {
  id: "a-file-page-without-an-asset-opens-the-library",
  title: "the file page without ?asset= sends to the Library",
  entryPoint: "/modules/media/file",
  async run(/** @type {Ctx} */ ctx) {
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto("/modules/media/file");
    await ctx.verify("the Library opens", [tab.at(/^\/modules\/media\/files$/, { timeoutMs: 20_000 })]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aSignedOutBrowserReachesTheFileThroughSignIn = {
  id: "a-signed-out-browser-reaches-the-file-through-sign-in",
  title: "a signed-out browser following a private link goes to the file's page, signs in there and comes back to the file",
  entryPoint: "<dashboard>/media/<id>/<name> without a session",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Private link"));
    const file = await uploaded(ctx, { folderId: folder.id, name: "secret.png", mimetype: "image/png", bytes: await image(ctx, { width: 8, height: 8 }) });
    const tab = await ctx.tab("anon");
    await tab.page.goto(`${ctx.state.apiUrl}/media/${file.id}/secret.png`);
    await tab.page.waitForURL((url) => url.pathname.startsWith("/auth"), { timeout: 30_000 }).catch(() => undefined);
    const atSignIn = tab.page.url();
    const credentials = ctx.state.accounts?.admin;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await tab.page.getByRole("button", { name: "Show password" }).click({ timeout: 5000 }).catch(() => undefined);
      if (await tab.page.getByRole("button", { name: "Hide password" }).isVisible()) break;
    }
    await tab.page.getByRole("textbox", { name: "Email address" }).fill(credentials?.email ?? "");
    await tab.page.getByRole("textbox", { name: "Password", exact: true }).fill(credentials?.password ?? "");
    await tab.page.getByRole("button", { name: "Login", exact: true }).click();
    const shown = await tab.visible({ role: "heading", name: "secret.png", level: 1 }, { timeoutMs: 40_000 });
    await ctx.verify("back on the file", [
      check("the link led to the sign-in of the file's page", new URL(atSignIn).pathname.startsWith("/auth") && decodeURIComponent(atSignIn).includes(`/modules/media/file?asset=${file.id}`), atSignIn),
      shown,
      check("on the file page", tab.page.url().includes(`/modules/media/file?asset=${file.id}`), tab.page.url()),
    ]);
  },
};

/**
 * Journeys of a file's page.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function filePageJourneys() {
  return [theFilePageHeaderStepsThroughTheFolder, theFileTabsEditAndShowTheFile, aFilePageWithoutAnAssetOpensTheLibrary, aSignedOutBrowserReachesTheFileThroughSignIn];
}
