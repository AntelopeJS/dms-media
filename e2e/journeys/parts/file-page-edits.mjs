import { createFolder, setVisibility, uploaded } from "../../library.mjs";
import { check, image, media, pick, raw } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const theFilePageRenamesMovesAndDeletesTheFile = {
  id: "the-file-page-renames-moves-and-deletes-the-file",
  title:
    "the file page's Details tab renames the file keeping its extension and its old link, refuses a name with a slash, moves it with Move…, offers to make a public file private instead of deleting it, and deletes it after a confirmation that leads back to its folder",
  entryPoint:
    "/modules/media/file?asset=<id> Details: Name, Move…, Delete file",
  async run(/** @type {Ctx} */ ctx) {
    const pagesName = ctx.unique("Pages");
    const elsewhereName = ctx.unique("Elsewhere");
    const pages = await createFolder(ctx, pagesName);
    const elsewhere = await createFolder(ctx, elsewhereName);
    const file = await uploaded(ctx, {
      folderId: pages.id,
      name: "photo.png",
      mimetype: "image/png",
      bytes: await image(ctx, { width: 24, height: 16 }),
    });
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto(`/modules/media/file?asset=${file.id}`);
    const name = { role: "textbox", name: "Name" };
    await ctx.verify("the Details tab", [
      tab.visible(name, { timeoutMs: 30_000 }),
      check(
        "the name field holds the base name",
        (await tab.value(name)) === "photo",
        "photo",
      ),
      tab.shows(/Links keep working after a rename/),
    ]);
    await tab.fill(name, "a/b");
    await tab.press("Enter");
    await ctx.verify(
      "a name with a slash is refused, and the field takes the file's name back",
      [
        tab.shows(/A name can't contain/, { timeoutMs: 15_000 }),
        check(
          "the field holds the base name again",
          (await tab.value(name)) === "photo",
          "photo",
        ),
      ],
    );
    const refused = await media(
      ctx,
      "read the file after the refused name",
      "GET",
      `/assets/${file.id}`,
    );
    await ctx.verify("the refused name changed nothing", [
      check(
        "the file keeps its name",
        pick(refused.body, "asset", "name") === "photo.png",
        refused.body,
      ),
    ]);
    await tab.fill(name, "façade été");
    await tab.press("Enter");
    await ctx.verify("the heading follows the rename", [
      tab.visible(
        { role: "heading", name: "façade été.png", level: 1 },
        { timeoutMs: 15_000 },
      ),
    ]);
    const renamed = await media(
      ctx,
      "read the renamed file",
      "GET",
      `/assets/${file.id}`,
    );
    const stale = await raw(ctx, "follow the old link", {
      path: `/media/${file.id}/photo.png`,
      as: "admin",
    });
    await ctx.verify("the rename reads back", [
      check(
        "the name keeps the extension",
        pick(renamed.body, "asset", "name") === "façade été.png",
        renamed.body,
      ),
      check(
        "the old link redirects to the new one",
        stale.status === 302 &&
          stale.headers.location ===
            `/media/${file.id}/${encodeURIComponent("façade été.png")}`,
        stale.headers.location,
      ),
    ]);
    const moveDialog = { role: "dialog", name: "Move 1 file to…" };
    await tab.click({ role: "button", name: "Move…", exact: true });
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
      name: new RegExp(`^${elsewhereName}`),
      within: moveDialog,
    });
    await tab.click({
      role: "button",
      name: "Move here",
      exact: true,
      within: moveDialog,
    });
    await ctx.verify("the page names the new folder", [
      tab.shows(/1 file moved/, { timeoutMs: 15_000 }),
      tab.visible(moveDialog, { hidden: true }),
      tab.shows(new RegExp(`${elsewhereName}`)),
    ]);
    const moved = await media(
      ctx,
      "read the moved file",
      "GET",
      `/assets/${file.id}`,
    );
    await ctx.verify("the move reads back", [
      check(
        "the file is in the other folder",
        pick(moved.body, "asset", "folderId") === elsewhere.id,
        moved.body,
      ),
    ]);
    await setVisibility(ctx, "assets", file.id, "public");
    await tab.reload();
    const deleteDialog = { role: "dialog", name: /^Delete (1 )?files?\?/ };
    await tab.click({ role: "button", name: "Delete file", exact: true });
    await ctx.verify("a public file's dialog offers to keep it", [
      tab.visible(deleteDialog),
      tab.shows(/1 file is public/),
      tab.visible({
        role: "button",
        name: "Delete nothing, make the public file private",
        within: deleteDialog,
      }),
    ]);
    await tab.click({
      role: "button",
      name: "Delete nothing, make the public file private",
      within: deleteDialog,
    });
    await ctx.verify("the file is kept, private", [
      tab.visible(deleteDialog, { hidden: true }),
      tab.at(/^\/modules\/media\/file$/),
    ]);
    const keptPrivate = await media(
      ctx,
      "read the file made private",
      "GET",
      `/assets/${file.id}`,
    );
    await ctx.verify("making it private reads back", [
      check(
        "it exists and is private",
        keptPrivate.status === 200 &&
          pick(keptPrivate.body, "asset", "visibility") === "private",
        keptPrivate.body,
      ),
    ]);
    await tab.click({ role: "button", name: "Delete file", exact: true });
    await ctx.verify("the confirmation", [
      tab.visible(deleteDialog),
      tab.shows(/Deleted files can't be recovered\./),
    ]);
    await tab.click({
      role: "button",
      name: "Delete file",
      exact: true,
      within: deleteDialog,
    });
    await ctx.verify("the Library opens on the file's folder", [
      tab.at(/^\/modules\/media\/files$/, { timeoutMs: 20_000 }),
      check(
        "with the folder in the link",
        tab.page.url().includes(`folder=${elsewhere.id}`),
        tab.page.url(),
      ),
      tab.shows(/1 file deleted/, { timeoutMs: 15_000 }),
    ]);
    const gone = await media(
      ctx,
      "read the deleted file",
      "GET",
      `/assets/${file.id}`,
    );
    const goneLink = await raw(ctx, "follow the deleted file's link", {
      path: `/media/${file.id}/${encodeURIComponent("façade été.png")}`,
      as: "admin",
    });
    await ctx.verify("the deletion reads back", [
      check("the file is 404", gone.status === 404, gone.status),
      check("its link is 404", goneLink.status === 404, goneLink.status),
    ]);
  },
};

/**
 * Journeys of the edits a file's page makes.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function filePageEditJourneys() {
  return [theFilePageRenamesMovesAndDeletesTheFile];
}
