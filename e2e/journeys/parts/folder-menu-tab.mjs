/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {import("../../media.mjs").Tab} Tab
 */

/**
 * A signed-in tab on the Library at a folder, once the card of a subfolder shows.
 *
 * @param {Ctx} ctx The journey
 * @param {string} parentId The folder whose subfolders the strip lists
 * @param {string} first A subfolder it lists
 * @returns {Promise<Tab>} The tab
 */
export async function stripTab(ctx, parentId, first) {
  const tab = await ctx.tab();
  await tab.signIn("admin");
  await tab.goto(`/modules/media/files?folder=${parentId}`);
  await ctx.verify("the folders strip lists the subfolders", [
    tab.visible(
      { role: "button", name: `More actions for ${first}`, exact: true },
      { timeoutMs: 30_000 },
    ),
  ]);
  return tab;
}

/**
 * Opens a folder card's menu and chooses an item, as a person does with the card's ⋯ button.
 *
 * @param {Tab} tab The tab
 * @param {string} folder The folder's name
 * @param {string} item The menu item's name
 * @returns {Promise<void>}
 */
export async function chooseFromMenu(tab, folder, item) {
  await tab.click({
    role: "button",
    name: `More actions for ${folder}`,
    exact: true,
  });
  await tab.click({ role: "menuitem", name: item, exact: true });
}
