import { guarded } from "../guard.mjs";
import { tree } from "../library.mjs";
import { check, media, pick, text } from "../media.mjs";
import { boundFolder } from "./folders.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */

/**
 * What a member may do in a folder, probed through the API: list it (read) and presign into it (write).
 *
 * @param {Ctx} ctx The journey
 * @param {string} folderId The folder
 * @param {string} as The member
 * @returns {Promise<{ read: boolean, write: boolean }>} The rights observed
 */
export async function probeRights(ctx, folderId, as) {
  const listed = await media(
    ctx,
    `${as} lists the folder`,
    "GET",
    `/folders/${folderId}/assets`,
    { as },
  );
  const presign = await media(
    ctx,
    `${as} presigns into the folder`,
    "POST",
    "/upload/presign",
    {
      body: {
        folderId,
        filename: "probe.png",
        size: 10,
        mimetype: "image/png",
      },
      as,
    },
  );
  return { read: listed.status === 200, write: presign.status === 200 };
}

/**
 * @param {{ read: boolean, write: boolean }} got The rights observed
 * @param {string} wanted `none`, `read` or `write`
 * @param {string} label Who, where
 * @returns {import("../media.mjs").Check} The check
 */
export function hasRights(got, wanted, label) {
  const expected = {
    none: { read: false, write: false },
    read: { read: true, write: false },
    write: { read: true, write: true },
  }[wanted];
  return check(
    `${label}: ${wanted}`,
    got.read === expected?.read && got.write === expected?.write,
    got,
  );
}

/** Folder bindings: the folders asset fields upload into, provisioned per tenant under Content. */
export const journeys = guarded([
  {
    id: "a-locked-folders-menu-says-why",
    title:
      "a linked folder's menu offers Why is this locked? and disables Rename, Move to… and Delete folder… each described as Locked; the dialog names the folder and its binding and has a Got it button; a disabled item opens nothing and the folder keeps its name",
    entryPoint: "/modules/media/files linked folder menu: Why is this locked?",
    async run(/** @type {Ctx} */ ctx) {
      const cover = await boundFolder(ctx, "verify.cover");
      const before = await tree(ctx);
      const row = before.folders.find((folder) => pick(folder, "id") === cover);
      const name = text(row, "name");
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto(`/modules/media/files?folder=${text(row, "parentId")}`);
      const more = {
        role: "button",
        name: `More actions for ${name}`,
        exact: true,
      };
      await ctx.verify("the Content folder lists the linked folder", [
        check("the linked folder has a name", name !== "", row),
        tab.visible(more, { timeoutMs: 30_000 }),
      ]);
      await tab.click(more);
      await ctx.verify("the menu locks Rename, Move to… and Delete folder…", [
        check(
          "each of the three is described as Locked",
          (
            (await tab.page.getByRole("menu").innerText()).match(
              /\bLocked\b/g,
            ) ?? []
          ).length === 3,
          (await tab.page.getByRole("menu").innerText()).replaceAll(
            "\n",
            " | ",
          ),
        ),
        tab.enabled({ role: "menuitem", name: /^Rename/ }, { disabled: true }),
        tab.enabled(
          { role: "menuitem", name: /^Move to…/ },
          { disabled: true },
        ),
        tab.enabled(
          { role: "menuitem", name: /^Delete folder…/ },
          { disabled: true },
        ),
        tab.enabled({
          role: "menuitem",
          name: "Why is this locked?",
          exact: true,
        }),
      ]);
      await tab.click({
        role: "menuitem",
        name: "Why is this locked?",
        exact: true,
      });
      const dialog = { role: "dialog", name: `${name} is linked to a field` };
      await ctx.verify("the dialog says why", [
        tab.visible(dialog),
        tab.shows(
          /A file field created this folder and decides who can use it\./,
        ),
        tab.shows(/Managed by\s+verify\.cover/),
        tab.shows(
          /You can upload, rename and edit the files inside\. To rename the folder, move it or change who can upload, edit the field definition in code\./,
        ),
        tab.visible({
          role: "button",
          name: "Got it",
          exact: true,
          within: dialog,
        }),
      ]);
      await tab.click({
        role: "button",
        name: "Got it",
        exact: true,
        within: dialog,
      });
      await ctx.verify("Got it closes it", [
        tab.visible(dialog, { hidden: true }),
      ]);
      await tab.click(more);
      await tab.page
        .getByRole("menuitem", { name: /^Rename/ })
        .click({ force: true, timeout: 10_000 });
      await tab.page.waitForTimeout(800);
      const after = await tree(ctx);
      await ctx.verify("a disabled Rename opens nothing", [
        tab.visible({ role: "dialog" }, { hidden: true, timeoutMs: 1500 }),
        check(
          "the folder keeps its name",
          text(
            after.folders.find((folder) => pick(folder, "id") === cover),
            "name",
          ) === name,
          name,
        ),
      ]);
    },
  },
]);
