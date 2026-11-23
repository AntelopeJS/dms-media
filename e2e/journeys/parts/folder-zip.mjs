import { readFileSync } from "node:fs";
import { createFolder, tree, uploaded } from "../../library.mjs";
import {
  check,
  image,
  longText,
  pick,
  raw,
  sha256,
  unzip,
} from "../../media.mjs";
import { chooseFromMenu, stripTab } from "./folder-menu-tab.mjs";

/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {import("../../media.mjs").Tab} Tab
 * @typedef {Awaited<ReturnType<typeof createFolder>>} Folder
 * @typedef {Awaited<ReturnType<typeof uploaded>>} UploadedFile
 */

const DAY_PATTERN = /-\d{4}-\d{2}-\d{2}\.zip$/;

/**
 * @typedef {{ tab: Tab, summerName: string, summer: Folder, direct: UploadedFile, nested: UploadedFile, notes: Buffer, png: Buffer, dialog: object, apply: object }} ZipScene
 */

/**
 * Creates a folder with a file, a subfolder with another, and opens the Library on it.
 *
 * @param {Ctx} ctx The journey context
 * @returns {Promise<ZipScene>} The tab and what it shows
 */
async function seedZipScene(ctx) {
  const parent = await createFolder(ctx, ctx.unique("Zip parent"));
  const summerName = ctx.unique("Été 2026");
  const summer = await createFolder(ctx, summerName, { parentId: parent.id });
  const sub = await createFolder(ctx, "Sous-dossier", {
    parentId: summer.id,
  });
  const notes = longText(5000);
  const png = await image(ctx, { width: 20, height: 20 });
  const direct = await uploaded(ctx, {
    folderId: summer.id,
    name: "notes.txt",
    mimetype: "text/plain",
    bytes: notes,
  });
  const nested = await uploaded(ctx, {
    folderId: sub.id,
    name: "image.png",
    mimetype: "image/png",
    bytes: png,
  });
  const tab = await stripTab(ctx, parent.id, summerName);
  const dialog = { role: "dialog", name: `Visibility of ${summerName}` };
  const apply = {
    role: "button",
    name: "Apply",
    exact: true,
    within: dialog,
  };
  return { tab, summerName, summer, direct, nested, notes, png, dialog, apply };
}

/**
 * Makes the folder public and checks that only its direct files open anonymously.
 *
 * @param {Ctx} ctx The journey context
 * @param {ZipScene} scene The tab and what it shows
 * @returns {Promise<void>}
 */
async function makeTheFolderPublic(ctx, scene) {
  const { tab, summerName, summer, direct, nested, dialog, apply } = scene;
  await chooseFromMenu(tab, summerName, "Visibility…");
  await ctx.verify("the Visibility dialog starts on Private with Apply off", [
    tab.visible(dialog),
    check(
      "Private is the current choice",
      (await tab
        .locator({ role: "radio", name: /^Private/, within: dialog })
        .first()
        .getAttribute("aria-checked")) === "true",
      "Private",
    ),
    tab.visible({ role: "radio", name: /^Public/, within: dialog }),
    tab.enabled(apply, { disabled: true }),
  ]);
  await tab.click({ role: "radio", name: /^Public/, within: dialog });
  await ctx.verify("going public warns first", [
    tab.shows(
      new RegExp(
        `The files of ${summerName} that follow the folder become public`,
      ),
    ),
    tab.enabled(apply),
  ]);
  await tab.click(apply);
  await ctx.verify("the folder is announced public", [
    tab.shows(new RegExp(`${summerName} is now public`)),
    tab.visible(dialog, { hidden: true }),
  ]);
  const published = await tree(ctx);
  const directLink = await raw(ctx, "the direct file's link, signed out", {
    path: `/media/${direct.id}/notes.txt`,
  });
  const nestedLink = await raw(ctx, "the subfolder file's link, signed out", {
    path: `/media/${nested.id}/image.png`,
  });
  await ctx.verify("the folder is public and reaches its direct files only", [
    check(
      "the tree says public",
      pick(
        published.folders.find((row) => pick(row, "id") === summer.id),
        "visibility",
      ) === "public",
      published.folders.find((row) => pick(row, "id") === summer.id),
    ),
    check(
      "the direct file opens anonymously",
      directLink.status === 302,
      directLink.status,
    ),
    check(
      "the subfolder's file stays private",
      nestedLink.status === 401,
      nestedLink.status,
    ),
  ]);
}

/**
 * Downloads the folder as a .zip and checks its name and bytes.
 *
 * @param {Ctx} ctx The journey context
 * @param {ZipScene} scene The tab and what it shows
 * @returns {Promise<void>}
 */
async function downloadTheFolderArchive(ctx, scene) {
  const { tab, summerName, notes, png } = scene;
  const download = tab.page
    .waitForEvent("download", { timeout: 30_000 })
    .catch(() => null);
  await chooseFromMenu(tab, summerName, "Download as .zip");
  const saved = await download;
  const savedPath = saved ? await saved.path() : null;
  const entries = savedPath ? unzip(readFileSync(savedPath)) : [];
  /** @param {string} name @returns {string} */
  const hash = (name) =>
    sha256(
      entries.find((entry) => entry.name === name)?.bytes ?? Buffer.alloc(0),
    );
  await ctx.verify("the download is the folder's archive", [
    check(
      "it is named after the folder and the day",
      saved !== null &&
        saved.suggestedFilename().startsWith(summerName) &&
        DAY_PATTERN.test(saved.suggestedFilename()),
      saved?.suggestedFilename(),
    ),
    check(
      "it holds both files, every byte",
      hash("notes.txt") === sha256(notes) &&
        hash("Sous-dossier/image.png") === sha256(png),
      entries.map((entry) => entry.name),
    ),
  ]);
}

/**
 * Makes the folder private again and checks its direct file needs a reader.
 *
 * @param {Ctx} ctx The journey context
 * @param {ZipScene} scene The tab and what it shows
 * @returns {Promise<void>}
 */
async function makeTheFolderPrivateAgain(ctx, scene) {
  const { tab, summerName, summer, direct, dialog, apply } = scene;
  await chooseFromMenu(tab, summerName, "Visibility…");
  await tab.click({ role: "radio", name: /^Private/, within: dialog });
  await tab.click(apply);
  await ctx.verify("the folder is announced private", [
    tab.shows(new RegExp(`${summerName} is now private`)),
    tab.visible(dialog, { hidden: true }),
  ]);
  const privateAgain = await tree(ctx);
  const closedLink = await raw(ctx, "the direct file's link after Private", {
    path: `/media/${direct.id}/notes.txt`,
  });
  await ctx.verify("the folder reads back private", [
    check(
      "the tree says private",
      pick(
        privateAgain.folders.find((row) => pick(row, "id") === summer.id),
        "visibility",
      ) === "private",
      privateAgain.folders.find((row) => pick(row, "id") === summer.id),
    ),
    check(
      "the direct file needs a reader again",
      closedLink.status === 401,
      closedLink.status,
    ),
  ]);
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aFoldersMenuPublishesAndZipsIt = {
  id: "a-folders-menu-publishes-and-zips-it",
  title:
    "a folder card's Visibility… makes the folder public and private again, reaching its direct files only, and Download as .zip saves an archive of the folder's files and subfolders",
  entryPoint: "/modules/media/files folder menu: Visibility…, Download as .zip",
  async run(/** @type {Ctx} */ ctx) {
    const scene = await seedZipScene(ctx);
    await makeTheFolderPublic(ctx, scene);
    await downloadTheFolderArchive(ctx, scene);
    await makeTheFolderPrivateAgain(ctx, scene);
  },
};

/**
 * Journeys of a folder card's Visibility and Download menu items.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function folderZipJourneys() {
  return [aFoldersMenuPublishesAndZipsIt];
}
