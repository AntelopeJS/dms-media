import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createFolder } from "../../library.mjs";
import { check, media, sha256 } from "../../media.mjs";
import { boundFolder } from "../folders.mjs";

/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {{ glyph: string, markers: string[] }} Row
 */

/**
 * Runs in the page. The icons of Locations tree rows, as the SVG path data of each: the glyph before a folder's name
 * and the markers after it. An icon's name is not in the DOM, but the same icon always draws the same paths.
 *
 * @param {string[]} folderIds The folders
 * @returns {string[][]} For each folder its id, its glyph's paths and its markers' paths; the id alone when the row is not in the tree
 */
function readRows(folderIds) {
  return folderIds.map((id) => {
    const item = document.querySelector(`[role="tree"] [role="treeitem"][data-tree-id="${id}"]`);
    const row = item?.firstElementChild;
    const name = item?.getAttribute("aria-label") ?? "";
    const label = row ? [...row.querySelectorAll("span")].find((span) => span.childElementCount === 0 && span.textContent?.trim() === name) : undefined;
    if (!row || !label) return [id];
    const icons = [...row.querySelectorAll("svg")];
    const glyph = icons.filter((svg) => !(label.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
    const markers = icons.filter((svg) => label.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING);
    return [id, glyph?.innerHTML ?? "", ...markers.map((svg) => svg.innerHTML)];
  });
}

/**
 * @param {import("../../media.mjs").Tab} tab The Library tab
 * @param {string[]} ids The folders
 * @returns {Promise<Record<string, Row | null>>} A short digest of each icon, null for a folder that is not in the tree
 */
async function rowsOf(tab, ids) {
  const drawn = await tab.page.evaluate(readRows, ids);
  /** @param {string} paths @returns {string} */
  const digest = (paths) => (paths === "" ? "" : sha256(Buffer.from(paths)).slice(0, 8));
  return Object.fromEntries(drawn.map(([id = "", glyph, ...markers]) => [id, glyph === undefined ? null : { glyph: digest(glyph), markers: markers.map(digest) }]));
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aLinkedFolderShowsTheLinkIconInTheLocationsTree = {
  id: "a-linked-folder-shows-the-link-icon-in-the-locations-tree",
  title: "in the Locations tree a folder linked to a field shows the link icon in place of the folder icon and again as its marker, with the tooltip Linked to a field; an unlinked folder shows the folder icon and no marker; a starred folder shows one marker that is not the link",
  entryPoint: "/modules/media/files, Locations tree",
  async run(/** @type {Ctx} */ ctx) {
    const plain = await createFolder(ctx, ctx.unique("Plain"));
    const starredName = ctx.unique("Starred");
    const starred = await createFolder(ctx, starredName);
    await media(ctx, "star a folder", "POST", "/favorites", { body: { kind: "folder", targetId: starred.id, starred: true } });
    const linked = await boundFolder(ctx, "verify.cover");
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto(`/modules/media/files?folder=${linked}`);
    const tree = tab.page.getByRole("tree", { name: "Locations" });
    await tab.visible({ role: "treeitem", name: new RegExp(`^${starredName}`) }, { timeoutMs: 30_000 });
    await tab.page.waitForTimeout(1000);
    const rows = await rowsOf(tab, [linked, plain.id, starred.id]);
    const marker = tab.page.locator(`[role="tree"] [role="treeitem"][data-tree-id="${linked}"] > div svg`).last();
    let tooltip = false;
    for (let attempt = 0; attempt < 10 && !tooltip; attempt += 1) {
      await marker.hover({ timeout: 5000 }).catch(() => undefined);
      tooltip = await tab.page.getByText("Linked to a field").first().isVisible({ timeout: 1500 }).catch(() => false);
      if (!tooltip) await tab.page.waitForTimeout(1000);
    }
    const step = ctx.step("the Locations tree icons");
    await tree.screenshot({ path: join(step, "locations.png") }).catch(() => undefined);
    writeFileSync(join(step, "icons.json"), `${JSON.stringify(rows, null, 2)}\n`);
    const link = rows[linked];
    const folder = rows[plain.id];
    const star = rows[starred.id];
    ctx.record(step, [
      check("the three folders are in the tree", link !== null && folder !== null && star !== null, rows),
      check("the linked folder's icon is the link, not the folder icon", link !== null && folder !== null && link.glyph !== "" && link.glyph !== folder.glyph, [link?.glyph, folder?.glyph]),
      check("it shows the link again as its marker", link !== null && link.markers.includes(link.glyph), link?.markers),
      check("the link tooltip says Linked to a field", tooltip, tooltip),
      check("an unlinked folder shows the folder icon and no marker", folder !== null && folder.glyph !== "" && folder.markers.length === 0, folder),
      check("a starred folder shows the same folder icon and one marker, not the link", star !== null && folder !== null && star.glyph === folder.glyph && star.markers.length === 1 && link !== null && star.markers[0] !== link.glyph, star),
    ]);
  },
};

/**
 * Journeys of the icons of the Library's folder tree.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function treeIconJourneys() {
  return [aLinkedFolderShowsTheLinkIconInTheLocationsTree];
}
