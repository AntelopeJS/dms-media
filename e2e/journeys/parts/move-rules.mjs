import { createFolder, uploaded } from "../../library.mjs";
import { check, image, media, pick } from "../../media.mjs";
import { boundFolder } from "../folders.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aMoveKeepsTheTargetsRules = {
  id: "a-move-keeps-the-targets-rules",
  title: "a file moved into a linked folder must be of a type its field accepts, and a file moved into a folder must not take a name already there, whatever its case: both moves are refused and the file stays",
  entryPoint: "POST /api/media/assets/:id/move, /assets/bulk/move into a linked folder or onto a taken name",
  async run(/** @type {Ctx} */ ctx) {
    const source = await createFolder(ctx, ctx.unique("Move source"));
    const target = await createFolder(ctx, ctx.unique("Move target"));
    const sheets = await boundFolder(ctx, "verify.sheets");
    const png = await uploaded(ctx, { folderId: source.id, name: "photo.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
    const lower = await uploaded(ctx, { folderId: source.id, name: "a.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
    await uploaded(ctx, { folderId: target.id, name: "A.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
    const intoField = await media(ctx, "move a PNG into the PDF field's folder", "POST", `/assets/${png.id}/move`, { body: { folderId: sheets } });
    const ontoName = await media(ctx, "move a.png next to A.png", "POST", `/assets/${lower.id}/move`, { body: { folderId: target.id } });
    const bulkIntoField = await media(ctx, "bulk move the PNG into the PDF field's folder", "POST", "/assets/bulk/move", { body: { ids: [png.id], folderId: sheets } });
    const after = await Promise.all([png.id, lower.id].map(async (id) => pick((await media(ctx, "read the file", "GET", `/assets/${id}`)).body, "asset", "folderId")));
    await ctx.verify("the target's rules", [
      check("a type the linked folder's field refuses: 415", intoField.status === 415, [intoField.status, intoField.body]),
      check("a name taken in the target, whatever its case: 409", ontoName.status === 409, [ontoName.status, ontoName.body]),
      check("the bulk move refuses the type too", JSON.stringify(pick(bulkIntoField.body, "done")) === "[]", bulkIntoField.body),
      check("both files stay where they were", after.every((folderId) => folderId === source.id), after),
    ]);
  },
};

/**
 * Journeys of the rules a move into a folder must keep.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function moveRuleJourneys() {
  return [aMoveKeepsTheTargetsRules];
}
