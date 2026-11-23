import { existsSync, readdirSync } from "node:fs";
import { createFolder, folderAssets, tree, uploaded } from "../../library.mjs";
import {
  check,
  image,
  media,
  pick,
  raw,
  storagePath,
  text,
} from "../../media.mjs";
import { chooseFromMenu, stripTab } from "./folder-menu-tab.mjs";

/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {import("../../media.mjs").Tab} Tab
 */

/**
 * @param {string} name A folder name
 * @returns {RegExp} What an accessible name starting with it matches
 */
function startingWith(name) {
  return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
}

/**
 * @typedef {Awaited<ReturnType<typeof createFolder>>} Folder
 * @typedef {Awaited<ReturnType<typeof uploaded>>} UploadedFile
 * @typedef {{ tab: Tab, alpha: Folder, target: Folder, file: UploadedFile, alphaName: string, takenName: string, targetName: string, betaName: string }} RenameScene
 */

/**
 * Creates a parent with three subfolders and a file in the first, and opens the Library on it.
 *
 * @param {Ctx} ctx The journey context
 * @returns {Promise<RenameScene>} The tab and what it shows
 */
async function seedRenameScene(ctx) {
  const parent = await createFolder(ctx, ctx.unique("Menu parent"));
  const alphaName = ctx.unique("Alpha");
  const takenName = ctx.unique("Taken");
  const targetName = ctx.unique("Target");
  const betaName = ctx.unique("Beta");
  const alpha = await createFolder(ctx, alphaName, { parentId: parent.id });
  await createFolder(ctx, takenName, { parentId: parent.id });
  const target = await createFolder(ctx, targetName, { parentId: parent.id });
  const file = await uploaded(ctx, {
    folderId: alpha.id,
    name: "plan.png",
    mimetype: "image/png",
    bytes: await image(ctx, { width: 12, height: 12 }),
  });
  const tab = await stripTab(ctx, parent.id, alphaName);
  return {
    tab,
    alpha,
    target,
    file,
    alphaName,
    takenName,
    targetName,
    betaName,
  };
}

/**
 * Renames a folder in its dialog, which refuses a taken name and a forbidden character.
 *
 * @param {Ctx} ctx The journey context
 * @param {RenameScene} scene The tab and what it shows
 * @returns {Promise<void>}
 */
async function renameTheFolder(ctx, scene) {
  const { tab, alpha, file, alphaName, takenName, betaName } = scene;
  const renameDialog = { role: "dialog", name: "Rename folder" };
  await chooseFromMenu(tab, alphaName, "Rename");
  await ctx.verify("the Rename dialog", [
    tab.visible(renameDialog),
    tab.visible({ role: "textbox", name: "Name", within: renameDialog }),
    check(
      "it holds the current name",
      (await tab.value({
        role: "textbox",
        name: "Name",
        within: renameDialog,
      })) === alphaName,
      alphaName,
    ),
  ]);
  await tab.fill(
    { role: "textbox", name: "Name", within: renameDialog },
    takenName.toUpperCase(),
  );
  await ctx.verify(
    "a sibling's name in any case is refused before the request",
    [
      tab.shows(/This name is already used here/),
      tab.enabled(
        { role: "button", name: "Rename", exact: true, within: renameDialog },
        { disabled: true },
      ),
    ],
  );
  await tab.fill(
    { role: "textbox", name: "Name", within: renameDialog },
    "a/b",
  );
  await ctx.verify("a forbidden character is refused", [
    tab.shows(/A name can't contain/),
    tab.enabled(
      { role: "button", name: "Rename", exact: true, within: renameDialog },
      { disabled: true },
    ),
  ]);
  await tab.fill(
    { role: "textbox", name: "Name", within: renameDialog },
    betaName,
  );
  await tab.click({
    role: "button",
    name: "Rename",
    exact: true,
    within: renameDialog,
  });
  await ctx.verify("the card shows the new name", [
    tab.visible(renameDialog, { hidden: true }),
    tab.visible(
      { role: "button", name: `More actions for ${betaName}`, exact: true },
      { timeoutMs: 15_000 },
    ),
    tab.visible(
      { role: "button", name: `More actions for ${alphaName}`, exact: true },
      { hidden: true },
    ),
  ]);
  const renamed = await tree(ctx);
  const renamedAssets = await folderAssets(ctx, alpha.id);
  await ctx.verify("the rename reads back through the API", [
    check(
      "the folder has the new name",
      text(
        renamed.folders.find((row) => pick(row, "id") === alpha.id),
        "name",
      ) === betaName,
      renamed.folders.map((row) => pick(row, "name")),
    ),
    check(
      "its file is still in it",
      renamedAssets.assets.map((asset) => text(asset, "id")).join() === file.id,
      renamedAssets.assets,
    ),
  ]);
}

/**
 * Moves the renamed folder to another through the tree and reads it back.
 *
 * @param {Ctx} ctx The journey context
 * @param {RenameScene} scene The tab and what it shows
 * @returns {Promise<void>}
 */
async function moveTheFolder(ctx, scene) {
  const { tab, alpha, target, file, targetName, betaName } = scene;
  const moveDialog = { role: "dialog", name: `Move ${betaName} to…` };
  await chooseFromMenu(tab, betaName, "Move to…");
  await ctx.verify("the Move dialog", [
    tab.visible(moveDialog),
    tab.visible({ role: "tree", name: "Folders", within: moveDialog }),
    tab.enabled(
      { role: "button", name: "Move here", exact: true, within: moveDialog },
      { disabled: true },
    ),
  ]);
  await tab.click({
    role: "treeitem",
    name: startingWith(targetName),
    within: moveDialog,
  });
  await tab.click({
    role: "button",
    name: "Move here",
    exact: true,
    within: moveDialog,
  });
  await ctx.verify("the folder left the strip", [
    tab.shows(new RegExp(`${betaName} moved`)),
    tab.visible(moveDialog, { hidden: true }),
    tab.visible(
      { role: "button", name: `More actions for ${betaName}`, exact: true },
      { hidden: true, timeoutMs: 15_000 },
    ),
  ]);
  const moved = await tree(ctx);
  const movedFile = await media(
    ctx,
    "read the file",
    "GET",
    `/assets/${file.id}`,
  );
  await ctx.verify("the move reads back through the API", [
    check(
      "the folder's parent is the target",
      text(
        moved.folders.find((row) => pick(row, "id") === alpha.id),
        "parentId",
      ) === target.id,
      moved.folders.find((row) => pick(row, "id") === alpha.id),
    ),
    check(
      "the file is unchanged in it",
      pick(movedFile.body, "asset", "folderId") === alpha.id &&
        pick(movedFile.body, "asset", "name") === "plan.png",
      movedFile.body,
    ),
  ]);
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aFoldersMenuRenamesAndMovesIt = {
  id: "a-folders-menu-renames-and-moves-it",
  title:
    "a folder card's menu renames the folder in a dialog that refuses a taken name and forbidden characters before it asks, and moves it to the folder picked in a tree; the tree and the folder's files read back the same",
  entryPoint: "/modules/media/files folder menu: Rename, Move to…",
  async run(/** @type {Ctx} */ ctx) {
    const scene = await seedRenameScene(ctx);
    await renameTheFolder(ctx, scene);
    await moveTheFolder(ctx, scene);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aFoldersMenuDeletesItAfterTypingItsName = {
  id: "a-folders-menu-deletes-it-after-typing-its-name",
  title:
    "a folder card's Delete folder… lists what goes with the folder and deletes it only after its name is typed; its subfolders, files and stored bytes are gone and a sibling folder stays",
  entryPoint: "/modules/media/files folder menu: Delete folder…",
  async run(/** @type {Ctx} */ ctx) {
    const parent = await createFolder(ctx, ctx.unique("Delete parent"));
    const doomedName = ctx.unique("Doomed");
    const doomed = await createFolder(ctx, doomedName, { parentId: parent.id });
    const sub = await createFolder(ctx, "Sub", { parentId: doomed.id });
    const keptName = ctx.unique("Kept");
    const kept = await createFolder(ctx, keptName, { parentId: parent.id });
    const bytes = await image(ctx, { width: 8, height: 8 });
    const gone = await uploaded(ctx, {
      folderId: sub.id,
      name: "gone.png",
      mimetype: "image/png",
      bytes,
    });
    const stays = await uploaded(ctx, {
      folderId: kept.id,
      name: "stays.png",
      mimetype: "image/png",
      bytes,
    });
    const tab = await stripTab(ctx, parent.id, doomedName);
    const dialog = {
      role: "dialog",
      name: `Delete ${doomedName} and everything in it?`,
    };
    const confirm = {
      role: "button",
      name: "Delete folder",
      exact: true,
      within: dialog,
    };
    await chooseFromMenu(tab, doomedName, "Delete folder…");
    await ctx.verify("the dialog names the impact", [
      tab.visible(dialog),
      tab.shows(
        /Subfolders and their files are deleted too\. This can't be undone\./,
      ),
      tab.shows(/Subfolders\s+1/),
      tab.shows(/Files\s+1/),
      tab.shows(/Space freed/),
      tab.shows(new RegExp(`Type ${doomedName} to confirm`)),
    ]);
    await tab.click(confirm);
    await ctx.verify("an empty confirmation is refused", [
      tab.visible(dialog),
      tab.shows(/This field is required/),
    ]);
    await tab.fill({ role: "textbox", within: dialog }, "wrong");
    await tab.click(confirm);
    await ctx.verify("a wrong text is refused", [
      tab.visible(dialog),
      tab.shows(new RegExp(`Type ${doomedName} exactly`)),
    ]);
    const untouched = await tree(ctx);
    await ctx.verify("nothing is deleted yet", [
      check(
        "the folder and its subfolder stay",
        [doomed.id, sub.id].every((id) =>
          untouched.folders.some((row) => pick(row, "id") === id),
        ),
        untouched.folders.map((row) => pick(row, "name")),
      ),
    ]);
    await tab.fill({ role: "textbox", within: dialog }, doomedName);
    await tab.click(confirm);
    await ctx.verify("the card is gone", [
      tab.shows(new RegExp(`${doomedName} deleted`)),
      tab.visible(dialog, { hidden: true }),
      tab.visible(
        { role: "button", name: `More actions for ${doomedName}`, exact: true },
        { hidden: true, timeoutMs: 15_000 },
      ),
      tab.visible({
        role: "button",
        name: `More actions for ${keptName}`,
        exact: true,
      }),
    ]);
    const read = await tree(ctx);
    const ids = read.folders.map((row) => text(row, "id"));
    const goneRead = await media(
      ctx,
      "read the deleted file",
      "GET",
      `/assets/${gone.id}`,
    );
    const goneLink = await raw(ctx, "the deleted file's link", {
      path: `/media/${gone.id}/gone.png`,
      as: "admin",
    });
    const keptRead = await media(
      ctx,
      "read the other file",
      "GET",
      `/assets/${stays.id}`,
    );
    const subStorage = storagePath(ctx, "files", "media", "default", sub.id);
    await ctx.verify("only the folder's own content is gone", [
      check(
        "both folders are gone",
        !ids.includes(doomed.id) && !ids.includes(sub.id),
        ids,
      ),
      check("the sibling folder stays", ids.includes(kept.id), ids),
      check(
        "the deleted file is 404",
        goneRead.status === 404,
        goneRead.status,
      ),
      check("its link is 404", goneLink.status === 404, goneLink.status),
      check(
        "its stored bytes are gone",
        !existsSync(subStorage) || readdirSync(subStorage).length === 0,
        subStorage,
      ),
      check("the other file stays", keptRead.status === 200, keptRead.status),
    ]);
  },
};

/**
 * Journeys of a folder card's menu in the Library.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function folderMenuJourneys() {
  return [
    aFoldersMenuRenamesAndMovesIt,
    aFoldersMenuDeletesItAfterTypingItsName,
  ];
}
