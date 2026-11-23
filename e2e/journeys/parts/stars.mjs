import { waitForHydration } from "../../chooser.mjs";
import { createFolder, tree, uploaded } from "../../library.mjs";
import { check, image, list, media, names, pick } from "../../media.mjs";

/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {import("../../media.mjs").Tab} Tab
 */

/**
 * Opens a file tile's context menu and chooses an item.
 *
 * @param {Tab} tab The tab, on a hydrated Library page
 * @param {string} file The file's name
 * @param {string} item The menu item's name
 * @returns {Promise<void>}
 */
async function chooseFromTileMenu(tab, file, item) {
  await tab.page
    .getByRole("option", {
      name: new RegExp(`^${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    })
    .click({ button: "right", timeout: 15_000 });
  await tab.click({ role: "menuitem", name: item, exact: true });
}

/**
 * @typedef {Awaited<ReturnType<typeof createFolder>>} Folder
 * @typedef {Awaited<ReturnType<typeof uploaded>>} UploadedFile
 * @typedef {{ parent: Folder, starryName: string, starry: Folder, star: UploadedFile, other: UploadedFile }} Fixture
 */

/**
 * Reads whether the Starred view lists a file.
 *
 * @param {Ctx} ctx The journey context
 * @param {string} id The file's id
 * @returns {Promise<boolean>} Whether the Starred view lists the file
 */
async function starredFlag(ctx, id) {
  const view = await media(
    ctx,
    "read the Starred view",
    "GET",
    "/views/starred",
  );
  return list(view.body, "assets").some((row) => pick(row, "id") === id);
}

/**
 * Creates a folder inside another, with two files in it.
 *
 * @param {Ctx} ctx The journey context
 * @returns {Promise<Fixture>} The folders and files
 */
async function seedFixture(ctx) {
  const parent = await createFolder(ctx, ctx.unique("Stars parent"));
  const starryName = ctx.unique("Starry");
  const starry = await createFolder(ctx, starryName, { parentId: parent.id });
  const star = await uploaded(ctx, {
    folderId: starry.id,
    name: "etoile.png",
    mimetype: "image/png",
    bytes: await image(ctx, { width: 10, height: 10 }),
  });
  const other = await uploaded(ctx, {
    folderId: starry.id,
    name: "autre.png",
    mimetype: "image/png",
    bytes: await image(ctx, { width: 11, height: 11 }),
  });
  return { parent, starryName, starry, star, other };
}

/**
 * Stars a file from its context menu and checks the menu then offers Remove star.
 *
 * @param {Ctx} ctx The journey context
 * @param {Tab} tab A signed-in tab
 * @param {Fixture} fixture The folders and files
 * @returns {Promise<void>}
 */
async function starTheFile(ctx, tab, fixture) {
  const { starry, star, other } = fixture;
  await tab.goto(`/modules/media/files?folder=${starry.id}`);
  await ctx.verify("the folder lists both files", [
    tab.visible(
      { role: "option", name: /^etoile\.png/ },
      { timeoutMs: 30_000 },
    ),
    tab.visible({ role: "option", name: /^autre\.png/ }),
  ]);
  await waitForHydration(tab, 60_000);
  await chooseFromTileMenu(tab, "etoile.png", "Star");
  let flag = await starredFlag(ctx, star.id);
  for (let attempt = 0; attempt < 20 && !flag; attempt += 1) {
    await tab.page.waitForTimeout(250);
    flag = await starredFlag(ctx, star.id);
  }
  await ctx.verify("the file is starred", [
    check("the Starred view lists it", flag, flag),
    check(
      "the other file is not in it",
      !(await starredFlag(ctx, other.id)),
      "autre.png",
    ),
  ]);
  await tab.page
    .getByRole("option", { name: /^etoile\.png/ })
    .click({ button: "right", timeout: 15_000 });
  await ctx.verify("the file's menu now offers Remove star", [
    tab.visible({ role: "menuitem", name: "Remove star", exact: true }),
    tab.visible(
      { role: "menuitem", name: "Star", exact: true },
      { hidden: true },
    ),
  ]);
  await tab.press("Escape");
}

/**
 * Stars the folder from its menu and checks the tree and the Starred count.
 *
 * @param {Ctx} ctx The journey context
 * @param {Tab} tab A signed-in tab
 * @param {Fixture} fixture The folders and files
 * @returns {Promise<void>}
 */
async function starTheFolder(ctx, tab, fixture) {
  const { parent, starry, starryName } = fixture;
  await tab.goto(`/modules/media/files?folder=${parent.id}`);
  await tab.visible(
    { role: "button", name: `More actions for ${starryName}`, exact: true },
    { timeoutMs: 30_000 },
  );
  await tab.click({
    role: "button",
    name: `More actions for ${starryName}`,
    exact: true,
  });
  await tab.click({ role: "menuitem", name: "Star", exact: true });
  let read = await tree(ctx);
  for (
    let attempt = 0;
    attempt < 20 &&
    pick(
      read.folders.find((row) => pick(row, "id") === starry.id),
      "starred",
    ) !== true;
    attempt += 1
  ) {
    await tab.page.waitForTimeout(250);
    read = await tree(ctx);
  }
  await ctx.verify("the folder is starred", [
    check(
      "the tree says starred",
      pick(
        read.folders.find((row) => pick(row, "id") === starry.id),
        "starred",
      ) === true,
      read.folders.find((row) => pick(row, "id") === starry.id),
    ),
    check(
      "the Starred view counts both",
      pick(read.answer.body, "views", "starred") === 2,
      pick(read.answer.body, "views"),
    ),
  ]);
}

/**
 * Opens the Starred view and reads it back through the API.
 *
 * @param {Ctx} ctx The journey context
 * @param {Tab} tab A signed-in tab
 * @param {Fixture} fixture The folders and files
 * @returns {Promise<void>}
 */
async function readTheStarredView(ctx, tab, fixture) {
  const { starryName } = fixture;
  await tab.click({ role: "button", name: /^Starred/ });
  await ctx.verify("the Starred view lists the starred folder and file only", [
    tab.visible(
      { role: "list", name: "Starred folders" },
      { timeoutMs: 15_000 },
    ),
    tab.visible({
      role: "button",
      name: `More actions for ${starryName}`,
      exact: true,
    }),
    tab.visible(
      { role: "option", name: /^etoile\.png/ },
      { timeoutMs: 15_000 },
    ),
    tab.visible({ role: "option", name: /^autre\.png/ }, { hidden: true }),
  ]);
  const view = await media(
    ctx,
    "read the Starred view",
    "GET",
    "/views/starred",
  );
  await ctx.verify("the view reads back through the API", [
    check(
      "its files",
      names(view.body, "assets").join() === "etoile.png",
      names(view.body, "assets"),
    ),
    check(
      "its folders",
      names(view.body, "folders").join() === starryName,
      names(view.body, "folders"),
    ),
  ]);
}

/**
 * Removes the star, undoes it, then removes it again.
 *
 * @param {Ctx} ctx The journey context
 * @param {Tab} tab A signed-in tab
 * @param {Fixture} fixture The folders and files
 * @returns {Promise<void>}
 */
async function removeAndRestoreTheStar(ctx, tab, fixture) {
  const { star, starryName } = fixture;
  await chooseFromTileMenu(tab, "etoile.png", "Remove star");
  await ctx.verify("the tile leaves the view with an Undo", [
    tab.shows(/etoile\.png removed from Starred/, { timeoutMs: 15_000 }),
    tab.visible({ role: "button", name: "Undo", exact: true }),
    tab.visible({ role: "option", name: /^etoile\.png/ }, { hidden: true }),
  ]);
  await tab.click({ role: "button", name: "Undo", exact: true });
  await ctx.verify("Undo brings the tile back", [
    tab.visible(
      { role: "option", name: /^etoile\.png/ },
      { timeoutMs: 15_000 },
    ),
  ]);
  const restored = await starredFlag(ctx, star.id);
  await chooseFromTileMenu(tab, "etoile.png", "Remove star");
  await ctx.verify("the star is removed again", [
    tab.visible(
      { role: "option", name: /^etoile\.png/ },
      { hidden: true, timeoutMs: 15_000 },
    ),
  ]);
  let last = await starredFlag(ctx, star.id);
  for (let attempt = 0; attempt < 20 && last; attempt += 1) {
    await tab.page.waitForTimeout(250);
    last = await starredFlag(ctx, star.id);
  }
  const finalView = await media(
    ctx,
    "read the Starred view again",
    "GET",
    "/views/starred",
  );
  await ctx.verify("what is left reads back", [
    check("Undo had restored the star", restored, restored),
    check("the removed star is gone", !last, last),
    check(
      "only the folder stays in the view",
      names(finalView.body, "assets").length === 0 &&
        names(finalView.body, "folders").join() === starryName,
      finalView.body,
    ),
  ]);
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theLibraryStarsFilesAndFolders = {
  id: "the-library-stars-files-and-folders",
  title:
    "Star in a file's context menu and in a folder's menu puts them in the Starred view, the menu then offers Remove star, and removing a star from the Starred view drops the tile with an Undo that brings it back",
  entryPoint: "/modules/media/files Star, Remove star, the Starred view",
  async run(/** @type {Ctx} */ ctx) {
    const fixture = await seedFixture(ctx);
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await starTheFile(ctx, tab, fixture);
    await starTheFolder(ctx, tab, fixture);
    await readTheStarredView(ctx, tab, fixture);
    await removeAndRestoreTheStar(ctx, tab, fixture);
  },
};

/**
 * Journeys of the stars of the Library.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function starJourneys() {
  return [theLibraryStarsFilesAndFolders];
}
