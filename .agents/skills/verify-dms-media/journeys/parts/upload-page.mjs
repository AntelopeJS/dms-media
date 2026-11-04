import { createFolder, folderAssets, uploaded, withConfig } from "../../library.mjs";
import { openFilePicker } from "../../chooser.mjs";
import { check, image, media } from "../../media.mjs";

/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {import("../../media.mjs").Tab} Tab
 * @typedef {{ name: string, mimeType: string, buffer: Buffer }} Chosen
 */

/**
 * Chooses files in the file picker that the Library's Upload button opens, the way a person does.
 *
 * @param {Ctx} ctx The journey
 * @param {Tab} tab The tab on a Library folder
 * @param {Chosen[]} files The files
 * @param {RegExp} [button] The button that opens the file picker
 * @returns {Promise<void>}
 */
export async function chooseFiles(ctx, tab, files, button = /^Upload/) {
  const folder = ctx.step(`choose ${files.map((file) => file.name).join(", ")}`);
  const picker = await openFilePicker(tab, () => tab.page.getByRole("button", { name: button }).first().click(), 30_000);
  await picker.choose(files);
  ctx.record(folder, [check("the file picker took the files", picker.opened, { files: files.length, attempts: picker.attempts, hydrated: picker.hydrated, url: picker.url })]);
}

/**
 * Signs the administrator in through the sign-in form of the dashboard served on another origin.
 *
 * @param {Ctx} ctx The journey
 * @param {Tab} tab The tab
 * @param {string} origin The dashboard's origin to use
 * @returns {Promise<void>}
 */
async function signInAt(ctx, tab, origin) {
  const credentials = ctx.state.accounts?.admin;
  await tab.page.goto(`${origin}/auth`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await tab.page.getByRole("button", { name: "Show password" }).click({ timeout: 5000 }).catch(() => undefined);
    if (await tab.page.getByRole("button", { name: "Hide password" }).isVisible()) break;
  }
  await tab.page.getByRole("textbox", { name: "Email address" }).fill(credentials?.email ?? "");
  await tab.page.getByRole("textbox", { name: "Password", exact: true }).fill(credentials?.password ?? "");
  await tab.page.getByRole("button", { name: "Login", exact: true }).click();
  await tab.page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 60_000 }).catch(() => undefined);
  ctx.record(ctx.step(`signed in on ${origin}`), [check("the administrator leaves /auth", !new URL(tab.page.url()).pathname.startsWith("/auth"), tab.page.url())], { critical: true });
}

/**
 * @param {Ctx} ctx The journey
 * @param {string} folderId The folder
 * @returns {Promise<Tab>} A signed-in tab on that folder of the Library
 */
async function libraryTab(ctx, folderId) {
  const tab = await ctx.tab();
  await tab.signIn("admin");
  await tab.goto(`/modules/media/files?folder=${folderId}`);
  await tab.visible({ role: "button", name: /^Upload/ }, { timeoutMs: 30_000 });
  return tab;
}

/**
 * Uploads one file in a batch and records the batch, as another tab's upload queue does.
 *
 * @param {Ctx} ctx The journey
 * @param {string} folderId The folder
 * @returns {Promise<void>}
 */
async function finishBatch(ctx, folderId) {
  const batchId = ctx.unique("batch");
  const bytes = await image(ctx, { width: 4, height: 4 });
  await uploaded(ctx, { folderId, name: `${batchId}.png`, mimetype: "image/png", bytes, batchId });
  await media(ctx, "record the batch", "POST", "/upload/batches", { body: { batchId, folderId, total: 1, uploaded: 1, failed: 0, size: bytes.byteLength } });
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aRefusedFileNeverStopsItsBatch = {
  id: "a-refused-file-never-stops-its-batch",
  title: "two files chosen in the Library: the refused HTML file is explained in plain words, the image still lands, and the batch shows on the Uploads page, in Failed today, with Open the folder",
  entryPoint: "Library › Upload, /modules/media/uploads",
  async run(/** @type {Ctx} */ ctx) {
    const name = ctx.unique("Queue");
    const folder = await createFolder(ctx, name);
    const tab = await libraryTab(ctx, folder.id);
    await chooseFiles(ctx, tab, [
      { name: "page.html", mimeType: "text/html", buffer: Buffer.from("<p>x</p>") },
      { name: "kept.png", mimeType: "image/png", buffer: await image(ctx, { width: 12, height: 12 }) },
    ]);
    await ctx.verify("the queue explains the refusal", [tab.shows(/This type of file isn't accepted in the library/, { timeoutMs: 30_000 })]);
    await ctx.verify("the other file is in the folder", [tab.shows(/kept\.png/, { timeoutMs: 30_000 })]);
    const listed = await folderAssets(ctx, folder.id);
    await ctx.verify("only the image was stored", [check("kept.png alone", listed.assets.length === 1 && listed.assets[0]?.name === "kept.png", listed.assets)]);
    await tab.goto("/modules/media/uploads");
    await ctx.verify("the Uploads page lists the batch", [
      tab.visible({ role: "heading", name: /^Uploads$/ }),
      tab.visible({ role: "link", name: "Upload files" }),
      tab.shows(new RegExp(`${name}[\\s\\S]*Some failed`), { timeoutMs: 30_000 }),
    ]);
    await tab.click({ role: "button", name: /^Failed today/ });
    await ctx.verify("Failed today keeps it", [tab.shows(new RegExp(name), { timeoutMs: 15_000 })]);
    await tab.click({ role: "button", name: `Actions for the upload to ${name}` });
    await tab.click({ role: "menuitem", name: "Open the folder" });
    const opened = await tab.visible({ role: "heading", name, level: 2 }, { timeoutMs: 20_000 });
    await ctx.verify("Open the folder opens it in the Library", [opened, tab.at(/^\/modules\/media\/files/), check("the folder is in the URL", tab.page.url().includes(`folder=${folder.id}`), tab.page.url())]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aLiveUploadsPageShowsANewBatch = {
  id: "a-live-uploads-page-shows-a-new-batch",
  title: "the Uploads page is live: a batch finished in another tab shows up in Recent batches on its own",
  entryPoint: "/modules/media/uploads, Live",
  async run(/** @type {Ctx} */ ctx) {
    const name = ctx.unique("Batch live");
    const folder = await createFolder(ctx, name);
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto("/modules/media/uploads");
    await tab.visible({ role: "group", name: "Live updates" }, { timeoutMs: 30_000 });
    await finishBatch(ctx, folder.id);
    await ctx.verify("the batch shows on its own", [tab.visible({ role: "row", name: new RegExp(`^${name}`) }, { timeoutMs: 40_000 })]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aPausedUploadsPageKeepsItsRows = {
  id: "a-paused-uploads-page-keeps-its-rows",
  title: "paused, Recent batches keeps its rows, a banner counts the new batches, and Show reads them once without leaving the pause",
  entryPoint: "/modules/media/uploads, Pause",
  async run(/** @type {Ctx} */ ctx) {
    const first = ctx.unique("Batch one");
    const second = ctx.unique("Batch two");
    const folderOne = await createFolder(ctx, first);
    const folderTwo = await createFolder(ctx, second);
    await finishBatch(ctx, folderOne.id);
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto("/modules/media/uploads");
    await tab.visible({ role: "row", name: new RegExp(`^${first}`) }, { timeoutMs: 30_000 });
    await tab.click({ role: "button", name: "Pause" });
    await finishBatch(ctx, folderTwo.id);
    await ctx.verify("paused, the rows stay and a banner counts what is new", [tab.shows(/1 new/, { timeoutMs: 20_000 }), tab.visible({ role: "row", name: new RegExp(`^${first}`) }), tab.visible({ role: "row", name: new RegExp(`^${second}`) }, { hidden: true }), tab.visible({ role: "button", name: "Show" })]);
    await tab.click({ role: "button", name: "Show" });
    await ctx.verify("Show reads once and stays paused", [tab.visible({ role: "row", name: new RegExp(`^${second}`) }, { timeoutMs: 15_000 }), tab.visible({ role: "button", name: "Pause", pressed: true })]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aTakenNameOffersKeepBothOrCancel = {
  id: "a-taken-name-offers-keep-both-or-cancel",
  title: "uploading a file whose name the folder already has, ignoring case, offers Keep both, which stores photo (2).jpg, or Cancel, which leaves the file out",
  entryPoint: "Library › Upload with a duplicate name",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Duplicates"));
    await uploaded(ctx, { folderId: folder.id, name: "photo.jpg", mimetype: "image/jpeg", bytes: await image(ctx, { width: 6, height: 6, format: "jpeg" }) });
    const tab = await libraryTab(ctx, folder.id);
    await chooseFiles(ctx, tab, [{ name: "PHOTO.jpg", mimeType: "image/jpeg", buffer: await image(ctx, { width: 6, height: 6, format: "jpeg" }) }]);
    await ctx.verify("Keep both and Cancel are offered", [tab.visible({ role: "button", name: "Keep both" }, { timeoutMs: 20_000 }), tab.visible({ role: "button", name: "Cancel" })]);
    await tab.click({ role: "button", name: "Keep both" });
    await ctx.verify("the copy lands numbered", [tab.shows(/PHOTO \(2\)\.jpg/, { timeoutMs: 30_000 })]);
    await chooseFiles(ctx, tab, [{ name: "photo.JPG", mimeType: "image/jpeg", buffer: await image(ctx, { width: 6, height: 6, format: "jpeg" }) }]);
    await tab.visible({ role: "button", name: "Keep both" }, { timeoutMs: 20_000 });
    await tab.click({ role: "button", name: "Cancel" });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const listed = await folderAssets(ctx, folder.id);
    await ctx.verify("Keep both added one file and Cancel none", [check("photo.jpg and PHOTO (2).jpg", JSON.stringify(listed.assets.map((asset) => String(asset.name)).sort((left, right) => left.localeCompare(right))) === JSON.stringify(["PHOTO (2).jpg", "photo.jpg"]), listed.assets.map((asset) => asset.name))]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aStorageThatRefusesTheOriginIsNamed = {
  id: "a-storage-that-refuses-the-origin-is-named",
  title: "a dashboard opened on an origin the API's CORS settings do not list, with the storage on the API's origin: presign works, the browser's PUT is blocked, the queue names the origin to add, and nothing is stored",
  entryPoint: "Library › Upload from http://localhost:<port>, storage on the API origin",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Blocked"));
    await withConfig(ctx, { VERIFY_MEDIA_STORAGE_ORIGIN: "api" }, async () => {
      const origin = ctx.state.webUrl.replace("127.0.0.1", "localhost");
      const tab = await ctx.tab();
      await signInAt(ctx, tab, origin);
      await tab.page.goto(`${origin}/modules/media/files?folder=${folder.id}`);
      await tab.visible({ role: "button", name: /^Upload/ }, { timeoutMs: 30_000 });
      await chooseFiles(ctx, tab, [{ name: "blocked.png", mimeType: "image/png", buffer: await image(ctx, { width: 6, height: 6 }) }]);
      await ctx.verify("the queue names the dashboard's origin", [tab.shows(new RegExp(`The storage refused this site's address \\(${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`), { timeoutMs: 40_000 })]);
      const listed = await folderAssets(ctx, folder.id);
      await ctx.verify("nothing was stored", [check("no file", listed.assets.length === 0, listed.assets)]);
    });
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const anUnreachableStorageIsNamed = {
  id: "an-unreachable-storage-is-named",
  title: "when the storage's address cannot be reached from the browser, the queue names that address and nothing is stored",
  entryPoint: "Library › Upload with the storage's baseUrl on a closed port",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Unreachable"));
    await withConfig(ctx, { VERIFY_MEDIA_STORAGE_ORIGIN: "unreachable" }, async () => {
      const tab = await libraryTab(ctx, folder.id);
      await chooseFiles(ctx, tab, [{ name: "far.png", mimeType: "image/png", buffer: await image(ctx, { width: 6, height: 6 }) }]);
      await ctx.verify("the queue names the storage's address", [tab.shows(/The storage address \(http:\/\/127\.0\.0\.1:9\) can't be reached/, { timeoutMs: 40_000 })]);
      const listed = await folderAssets(ctx, folder.id);
      await ctx.verify("nothing was stored", [check("no file", listed.assets.length === 0, listed.assets)]);
    });
  },
};

/**
 * Journeys of the upload queue and the Uploads page.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function uploadPageJourneys() {
  return [aRefusedFileNeverStopsItsBatch, aLiveUploadsPageShowsANewBatch, aPausedUploadsPageKeepsItsRows, aTakenNameOffersKeepBothOrCancel, aStorageThatRefusesTheOriginIsNamed, anUnreachableStorageIsNamed];
}
