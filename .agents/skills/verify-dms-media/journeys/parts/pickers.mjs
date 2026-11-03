import { createFolder, folderAssets, uploaded, withConfig } from "../../library.mjs";
import { openFilePicker } from "../../chooser.mjs";
import { check, image, text } from "../../media.mjs";
import { boundFolder } from "../folders.mjs";

/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {import("../../media.mjs").Tab} Tab
 * @typedef {{ name: string, mimeType: string, buffer: Buffer }} Chosen
 */

/**
 * Clicks a button that opens the browser's file picker, again while the page hydrates, and answers the picker with
 * several files in one event.
 *
 * @param {Ctx} ctx The journey
 * @param {Tab} tab The tab
 * @param {import("playwright-core").Locator} button The button
 * @param {Chosen[]} files The files
 * @returns {Promise<boolean>} Whether a picker opened
 */
async function pickSeveral(ctx, tab, button, files) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const opened = await openFilePicker(tab, () => button.click({ timeout: 10_000 }).catch(() => undefined), 6000);
    if (opened.opened) {
      const several = opened.multiple;
      await opened.choose(several ? files : files.slice(0, 1)).catch(() => undefined);
      ctx.record(ctx.step(`choose ${files.map((file) => file.name).join(", ")} at once`), [check("the picker takes several files at once", several, several)]);
      return several;
    }
  }
  ctx.record(ctx.step(`choose ${files.length} files at once`), [check("the picker opened", false, "no file chooser")]);
  return false;
}

/**
 * Picks the destination folder in the dialog the Overview and Uploads pages open before the file picker.
 *
 * @param {Tab} tab The tab
 * @param {string} name The folder's name
 * @returns {Promise<void>}
 */
async function chooseDestination(tab, name) {
  const dialog = tab.page.getByRole("dialog");
  await dialog.getByText(name).first().click({ timeout: 15_000 }).catch(() => undefined);
  await dialog.getByRole("button", { name: /Choose|Select|Use|Upload/ }).last().click({ timeout: 15_000 }).catch(() => undefined);
}

/**
 * Reads a folder until it holds the given names.
 *
 * @param {Ctx} ctx The journey
 * @param {string} folderId The folder
 * @param {string[]} wanted The file names
 * @returns {Promise<string[]>} The names the folder holds
 */
async function landed(ctx, folderId, wanted) {
  let found = (await folderAssets(ctx, folderId)).assets.map((asset) => text(asset, "name"));
  for (let attempt = 0; attempt < 30 && !wanted.every((name) => found.includes(name)); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    found = (await folderAssets(ctx, folderId)).assets.map((asset) => text(asset, "name"));
  }
  return found;
}

/**
 * @param {Ctx} ctx The journey
 * @param {string} prefix The start of each name
 * @returns {Promise<Chosen[]>} Two images
 */
async function twoImages(ctx, prefix) {
  return [
    { name: `${prefix}-un.png`, mimeType: "image/png", buffer: await image(ctx, { width: 6, height: 6 }) },
    { name: `${prefix}-deux.png`, mimeType: "image/png", buffer: await image(ctx, { width: 7, height: 7 }) },
  ];
}

/**
 * Journeys of the file pickers and of the queue's explanations.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function pickerJourneys() {
  return [
    {
      id: "every-file-picker-takes-several-files",
      title: "the Library's Upload, the Overview's Choose files, the Uploads page's Upload files and a multiple asset field's upload each take several files in one pick, and every file lands",
      entryPoint: "file pickers of /modules/media/files, /overview, /uploads and /verify-fields",
      async run(/** @type {Ctx} */ ctx) {
        const name = ctx.unique("Several");
        const folder = await createFolder(ctx, name);
        const tab = await ctx.tab();
        await tab.signIn("admin");
        const results = [];
        await tab.goto(`/modules/media/files?folder=${folder.id}`);
        const library = await twoImages(ctx, "bibliotheque");
        await pickSeveral(ctx, tab, tab.page.getByRole("button", { name: /^Upload/ }).first(), library);
        results.push({ where: "Library Upload", wanted: library.map((file) => file.name), found: await landed(ctx, folder.id, library.map((file) => file.name)) });
        await tab.goto("/modules/media/overview");
        await tab.page.getByRole("button", { name: "Choose a folder" }).click({ timeout: 20_000 }).catch(() => undefined);
        await chooseDestination(tab, name);
        const overview = await twoImages(ctx, "apercu");
        await pickSeveral(ctx, tab, tab.page.getByRole("button", { name: /^Choose files/ }), overview);
        results.push({ where: "Overview Choose files", wanted: overview.map((file) => file.name), found: await landed(ctx, folder.id, overview.map((file) => file.name)) });
        await tab.goto("/modules/media/uploads");
        await tab.page.getByRole("link", { name: "Upload files" }).click({ timeout: 20_000 }).catch(() => undefined);
        const page = await twoImages(ctx, "envois");
        const opened = await openFilePicker(tab, () => chooseDestination(tab, name), 30_000);
        const several = opened.multiple;
        if (opened.opened) await opened.choose(several ? page : page.slice(0, 1)).catch(() => undefined);
        ctx.record(ctx.step("choose the Uploads page's files at once"), [check("the Uploads page's picker takes several files at once", several, several)]);
        results.push({ where: "Uploads page Upload files", wanted: page.map((file) => file.name), found: await landed(ctx, folder.id, page.map((file) => file.name)) });
        const projects = await boundFolder(ctx, "verify.projects");
        await tab.goto("/verify-fields");
        const field = await twoImages(ctx, "champ");
        await pickSeveral(ctx, tab, tab.page.getByRole("button", { name: "Upload to Verify projects" }), field);
        results.push({ where: "the Projects field's upload", wanted: field.map((file) => file.name), found: await landed(ctx, projects, field.map((file) => file.name)) });
        await ctx.verify("every file of each pick landed", results.map((row) => check(`${row.where}: both files`, row.wanted.every((wanted) => row.found.includes(wanted)), row)));
      },
    },
    {
      id: "the-queue-explains-each-refusal",
      title: "a refusal is explained in plain words in the batch's result on the Uploads page: the types a linked folder's field accepts, an image that does not decode, a full storage plan; the other files of the batch land",
      entryPoint: "Library › Upload into a linked folder, a broken image, a full plan",
      async run(/** @type {Ctx} */ ctx) {
        const sheets = await boundFolder(ctx, "verify.sheets");
        const folder = await createFolder(ctx, ctx.unique("Explained"));
        const tab = await ctx.tab();
        await tab.signIn("admin");
        await tab.goto(`/modules/media/files?folder=${sheets}`);
        await pickSeveral(ctx, tab, tab.page.getByRole("button", { name: /^Upload/ }).first(), [{ name: "photo.png", mimeType: "image/png", buffer: await image(ctx, { width: 5, height: 5 }) }]);
        await tab.page.waitForTimeout(3000);
        await tab.goto("/modules/media/uploads");
        await ctx.verify("the queue names the types the field accepts", [tab.shows(/photo\.png[^\n]*only accepts application\/pdf/i, { timeoutMs: 30_000 })]);
        await tab.goto(`/modules/media/files?folder=${folder.id}`);
        await pickSeveral(ctx, tab, tab.page.getByRole("button", { name: /^Upload/ }).first(), [
          { name: "casse.png", mimeType: "image/png", buffer: Buffer.from("not a png") },
          { name: "bonne.png", mimeType: "image/png", buffer: await image(ctx, { width: 5, height: 5 }) },
        ]);
        const bonne = await landed(ctx, folder.id, ["bonne.png"]);
        await tab.goto("/modules/media/uploads");
        await ctx.verify("an image that does not decode is explained, the other lands", [tab.shows(/casse\.png[^\n]*not a readable image/i, { timeoutMs: 30_000 }), check("bonne.png landed", bonne.includes("bonne.png"), bonne)]);
        await uploaded(ctx, { folderId: folder.id, name: "remplit.txt", mimetype: "text/plain", bytes: Buffer.alloc(4000, 97) });
        await withConfig(ctx, { VERIFY_MEDIA_QUOTA: "5000" }, async () => {
          const quotaTab = await ctx.tab("admin", "quota");
          await quotaTab.signIn("admin");
          await quotaTab.goto(`/modules/media/files?folder=${folder.id}`);
          await pickSeveral(ctx, quotaTab, quotaTab.page.getByRole("button", { name: /^Upload/ }).first(), [{ name: "trop.txt", mimeType: "text/plain", buffer: Buffer.alloc(3000, 98) }]);
          await quotaTab.page.waitForTimeout(3000);
          await quotaTab.goto("/modules/media/uploads");
          await ctx.verify("a full plan is explained", [quotaTab.shows(/trop\.txt[^\n]*storage plan (is )?full/i, { timeoutMs: 30_000 })]);
        });
      },
    },
  ];
}
