import { aclFolder, member, uploaded } from "../../library.mjs";
import { check, image, list, media, pick } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/**
 * @param {unknown} body A bulk answer
 * @param {string} id A file
 * @returns {unknown} The refusal of that file, if any
 */
function refusalOf(body, id) {
  return list(body, "refused").find((row) => pick(row, "id") === id);
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const bulkWritesKeepTheOwnerOnlyRules = {
  id: "bulk-writes-keep-the-owner-only-rules",
  title: "the per-file rules hold on the bulk routes: a member who manages folders gets 403 for each file of a bulk visibility change, for each file a bulk move would make public, for a bulk move into a folder it only reads and a bulk delete there, and the files stay as they were; a bulk move that keeps them private goes through",
  entryPoint: "POST /api/media/assets/bulk/visibility, /assets/bulk/move as a member",
  async run(/** @type {Ctx} */ ctx) {
    const privateA = await aclFolder(ctx, "verify.bulkvis", ["manage"]);
    const privateB = await aclFolder(ctx, "verify.bulkvis", ["manage"]);
    const publicC = await aclFolder(ctx, "verify.bulkvis", ["manage"]);
    await media(ctx, "the owner publishes C", "POST", `/folders/${publicC}/visibility`, { body: { visibility: "public" } });
    const one = await uploaded(ctx, { folderId: privateA, name: "un.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
    const two = await uploaded(ctx, { folderId: privateA, name: "deux.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
    const readOnly = await aclFolder(ctx, "verify.bulkvis", ["read"]);
    const kept = await uploaded(ctx, { folderId: readOnly, name: "lu.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
    await member(ctx, "bulkmanager", ["verify.bulkvis"]);
    const intoReadOnly = await media(ctx, "the member bulk-moves a file into a folder it only reads", "POST", "/assets/bulk/move", { body: { ids: [one.id], folderId: readOnly }, as: "bulkmanager" });
    const deleteReadOnly = await media(ctx, "the member bulk-deletes a file of a folder it only reads", "POST", "/assets/bulk/delete", { body: { ids: [kept.id] }, as: "bulkmanager" });
    const stillThere = await media(ctx, "read that file", "GET", `/assets/${kept.id}`);
    const shown = await media(ctx, "the member bulk-publishes both", "POST", "/assets/bulk/visibility", { body: { ids: [one.id, two.id], visibility: "public" }, as: "bulkmanager" });
    const toPublic = await media(ctx, "the member bulk-moves both into the public folder", "POST", "/assets/bulk/move", { body: { ids: [one.id, two.id], folderId: publicC }, as: "bulkmanager" });
    const afterRefusals = await Promise.all([one.id, two.id].map(async (id) => pick((await media(ctx, "read the file", "GET", `/assets/${id}`)).body, "asset")));
    const toPrivate = await media(ctx, "the member bulk-moves both into another private folder", "POST", "/assets/bulk/move", { body: { ids: [one.id, two.id], folderId: privateB }, as: "bulkmanager" });
    await ctx.verify("the owner-only rules hold in bulk", [
      check("bulk visibility: nothing done", list(shown.body, "done").length === 0, shown.body),
      check("bulk visibility: each file refused 403", [one.id, two.id].every((id) => pick(refusalOf(shown.body, id), "status") === 403), shown.body),
      check("a bulk move that would make them public: nothing done", list(toPublic.body, "done").length === 0, toPublic.body),
      check("and each file refused 403", [one.id, two.id].every((id) => pick(refusalOf(toPublic.body, id), "status") === 403), toPublic.body),
      check("both files are still in A, following it", afterRefusals.every((asset) => pick(asset, "folderId") === privateA && pick(asset, "visibility") === "inherit"), afterRefusals),
      check("a bulk move into a folder the member only reads: refused 403", pick(refusalOf(intoReadOnly.body, one.id), "status") === 403 && list(intoReadOnly.body, "done").length === 0, intoReadOnly.body),
      check("a bulk delete in a folder the member only reads: refused 403, the file kept", pick(refusalOf(deleteReadOnly.body, kept.id), "status") === 403 && stillThere.status === 200, [deleteReadOnly.body, stillThere.status]),
      check("a bulk move that keeps them private goes through", JSON.stringify(pick(toPrivate.body, "done")) === JSON.stringify([one.id, two.id]), toPrivate.body),
    ]);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const everyBulkRouteTakesUpTo500Ids = {
  id: "every-bulk-route-takes-up-to-500-ids",
  title: "bulk move and bulk visibility, like bulk delete, refuse 501 ids with 400 and take 500, each unknown id refused",
  entryPoint: "POST /api/media/assets/bulk/move, /assets/bulk/visibility",
  async run(/** @type {Ctx} */ ctx) {
    const target = await aclFolder(ctx, "verify.unused", ["read"]);
    /** @param {number} count @returns {string[]} */
    const ids = (count) => Array.from({ length: count }, (_, index) => `id-${index}`);
    const checks = [];
    /** @type {{ route: string, body: Record<string, string> }[]} */
    const routes = [{ route: "move", body: { folderId: target } }, { route: "visibility", body: { visibility: "public" } }];
    for (const { route, body } of routes) {
      const tooMany = await media(ctx, `bulk ${route} with 501 ids`, "POST", `/assets/bulk/${route}`, { body: { ...body, ids: ids(501) } });
      const most = await media(ctx, `bulk ${route} with 500 unknown ids`, "POST", `/assets/bulk/${route}`, { body: { ...body, ids: ids(500) } });
      checks.push(
        check(`bulk ${route}: 501 ids refused 400 with an error key`, tooMany.status === 400 && JSON.stringify(tooMany.body).includes("$dms_media.errors."), [tooMany.status, tooMany.body]),
        check(`bulk ${route}: 500 ids taken, each refused`, most.status === 200 && list(most.body, "refused").length === 500, [most.status, list(most.body, "refused").length]),
      );
    }
    await ctx.verify("the 500-id cap", checks);
  },
};

/**
 * Journeys of the bulk routes against the per-file rules.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function bulkRuleJourneys() {
  return [bulkWritesKeepTheOwnerOnlyRules, everyBulkRouteTakesUpTo500Ids];
}
