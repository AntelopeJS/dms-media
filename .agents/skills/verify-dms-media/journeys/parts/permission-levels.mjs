import { aclFolder, createFolder, declareFolder, member, uploaded } from "../../library.mjs";
import { check, doneIds, image, list, media, pick, raw, text, unzip } from "../../media.mjs";

/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {import("../../media.mjs").Answer} Answer
 * @typedef {import("../../media.mjs").Check} Check
 */

/**
 * @param {Answer} answer A member's call
 * @returns {boolean} Whether it was refused: 403, or 404 for a file the member may not see
 */
function refused(answer) {
  return answer.status === 403 || answer.status === 404;
}

/**
 * @param {Answer} answer A member's call
 * @returns {boolean} Whether it went through
 */
function allowed(answer) {
  return answer.status !== null && answer.status >= 200 && answer.status < 300;
}

/**
 * @param {string} route The route
 * @param {string} level The right it needs
 * @param {Answer} below The call one level below
 * @param {Answer} at The call at that level
 * @returns {Check[]} Both checks
 */
function levelChecks(route, level, below, at) {
  return [
    check(`${route}: refused one level below ${level}`, refused(below), [below.status, below.body]),
    check(`${route}: allowed with ${level}`, allowed(at), [at.status, at.body]),
  ];
}

/**
 * @param {unknown} body A bulk answer
 * @returns {{ done: number, refused: unknown[] }} What it did and what it refused
 */
function bulkOutcome(body) {
  return { done: doneIds(body).length, refused: list(body, "refused").map((row) => pick(row, "status")) };
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const everyRouteNeedsItsDocumentedRight = {
  id: "every-route-needs-its-documented-right",
  title: "every folder and file route needs exactly its documented right: reading needs read, uploading and changing files (rename, alt, move, delete, edit, revert, save as copy, bulk move and delete) need write, changing the folder structure (create, rename, move, delete) needs manage; one level below is refused, the level itself is allowed",
  entryPoint: "every /api/media folder and file route, as a member at each right",
  async run(/** @type {Ctx} */ ctx) {
    const none = await aclFolder(ctx, "verify.lvother", ["read"]);
    const readF = await aclFolder(ctx, "verify.lv", ["read"]);
    const writeF = await aclFolder(ctx, "verify.lv", ["write"]);
    const writeF2 = await aclFolder(ctx, "verify.lv", ["write"]);
    const manageF = await aclFolder(ctx, "verify.lv", ["manage"]);
    const manageF2 = await aclFolder(ctx, "verify.lv", ["manage"]);
    /** @param {string} folderId @param {string} name @returns {Promise<string>} */
    const put = async (folderId, name) => (await uploaded(ctx, { folderId, name, mimetype: "image/png", bytes: await image(ctx, { width: 8, height: 6 }) })).id;
    const inNone = await put(none, "n.png");
    const inRead = [await put(readF, "r1.png"), await put(readF, "r2.png"), await put(readF, "r3.png"), await put(readF, "r4.png")];
    const inWrite = [await put(writeF, "w1.png"), await put(writeF, "w2.png"), await put(writeF, "w3.png"), await put(writeF, "w4.png"), await put(writeF, "w5.png")];
    await media(ctx, "the owner rotates r3, so it has an original", "POST", `/assets/${inRead[2]}/transform`, { body: { rotate: 90 } });
    await media(ctx, "the owner rotates w3, so it has an original", "POST", `/assets/${inWrite[2]}/transform`, { body: { rotate: 90 } });
    await member(ctx, "leveled", ["verify.lv"]);
    const as = "leveled";
    /** @param {string} label @param {string} method @param {string} path @param {unknown} [body] @returns {Promise<Answer>} */
    const call = (label, method, path, body) => media(ctx, label, method, path, body === undefined ? { as } : { body, as });
    const checks = [];
    checks.push(...levelChecks("GET /folders/:id/assets", "read", await call("list without read", "GET", `/folders/${none}/assets`), await call("list with read", "GET", `/folders/${readF}/assets`)));
    for (const suffix of ["", "/read-url", "/history", "/information", "/delivery", "/tab-counts"]) {
      checks.push(...levelChecks(`GET /assets/:id${suffix}`, "read", await call(`GET${suffix} without read`, "GET", `/assets/${inNone}${suffix}`), await call(`GET${suffix} with read`, "GET", `/assets/${inRead[0]}${suffix}`)));
    }
    const zipNone = await raw(ctx, "zip a folder without read", { path: `/api/media/folders/${none}/zip`, method: "POST", as, headers: { "content-type": "application/json" }, body: Buffer.from("{}") });
    const zipRead = await raw(ctx, "zip a folder with read", { path: `/api/media/folders/${readF}/zip`, method: "POST", as, headers: { "content-type": "application/json" }, body: Buffer.from("{}") });
    checks.push(check("zip a folder: refused without read", zipNone.status === 403 || zipNone.status === 404, zipNone.status), check("zip a folder: allowed with read", zipRead.status === 200 && unzip(zipRead.bytes).length === 4, zipRead.status));
    const presign = (/** @type {string} */ folderId) => call("presign", "POST", "/upload/presign", { folderId, filename: "p.png", size: 10, mimetype: "image/png" });
    checks.push(...levelChecks("POST /upload/presign", "write", await presign(readF), await presign(writeF)));
    checks.push(...levelChecks("POST /assets/:id/update (alt)", "write", await call("describe with read", "POST", `/assets/${inRead[0]}/update`, { alt: "lu" }), await call("describe with write", "POST", `/assets/${inWrite[0]}/update`, { alt: "écrit" })));
    checks.push(...levelChecks("POST /assets/:id/update (rename)", "write", await call("rename with read", "POST", `/assets/${inRead[0]}/update`, { name: "lu.png" }), await call("rename with write", "POST", `/assets/${inWrite[0]}/update`, { name: "écrit.png" })));
    checks.push(...levelChecks("POST /assets/:id/transform", "write", await call("rotate with read", "POST", `/assets/${inRead[1]}/transform`, { rotate: 90 }), await call("rotate with write", "POST", `/assets/${inWrite[1]}/transform`, { rotate: 90 })));
    checks.push(...levelChecks("POST /assets/:id/transform/copy (Save as copy)", "write", await call("save as copy with read", "POST", `/assets/${inRead[1]}/transform/copy`, { rotate: 90 }), await call("save as copy with write", "POST", `/assets/${inWrite[1]}/transform/copy`, { rotate: 90 })));
    checks.push(...levelChecks("POST /assets/:id/revert", "write", await call("revert with read", "POST", `/assets/${inRead[2]}/revert`), await call("revert with write", "POST", `/assets/${inWrite[2]}/revert`)));
    checks.push(...levelChecks("POST /assets/:id/move, out of a folder", "write", await call("move out of a read folder", "POST", `/assets/${inRead[3]}/move`, { folderId: writeF2 }), await call("move out of a write folder", "POST", `/assets/${inWrite[3]}/move`, { folderId: writeF2 })));
    checks.push(...levelChecks("POST /assets/:id/move, into a folder", "write", await call("move into a read folder", "POST", `/assets/${inWrite[4]}/move`, { folderId: readF }), await call("move into a write folder", "POST", `/assets/${inWrite[4]}/move`, { folderId: writeF2 })));
    const bulkMoveRead = await call("bulk move with read", "POST", "/assets/bulk/move", { ids: [inRead[0]], folderId: writeF2 });
    const bulkMoveWrite = await call("bulk move with write", "POST", "/assets/bulk/move", { ids: [inWrite[0]], folderId: writeF2 });
    const bulkDeleteRead = await call("bulk delete with read", "POST", "/assets/bulk/delete", { ids: [inRead[1]] });
    const bulkDeleteWrite = await call("bulk delete with write", "POST", "/assets/bulk/delete", { ids: [inWrite[1]] });
    checks.push(
      check("bulk move: refused one level below write", bulkOutcome(bulkMoveRead.body).done === 0 && bulkOutcome(bulkMoveRead.body).refused[0] === 403, bulkMoveRead.body),
      check("bulk move: done with write", bulkOutcome(bulkMoveWrite.body).done === 1, bulkMoveWrite.body),
      check("bulk delete: refused one level below write", bulkOutcome(bulkDeleteRead.body).done === 0 && bulkOutcome(bulkDeleteRead.body).refused[0] === 403, bulkDeleteRead.body),
      check("bulk delete: done with write", bulkOutcome(bulkDeleteWrite.body).done === 1, bulkDeleteWrite.body),
    );
    checks.push(...levelChecks("DELETE /assets/:id", "write", await call("delete with read", "DELETE", `/assets/${inRead[3]}`), await call("delete with write", "DELETE", `/assets/${inWrite[4]}`)));
    checks.push(...levelChecks("POST /folders (a subfolder)", "manage", await call("create under a write folder", "POST", "/folders", { name: "Sous", parentId: writeF }), await call("create under a manage folder", "POST", "/folders", { name: "Sous", parentId: manageF })));
    const underWrite = [await createFolder(ctx, "W a", { parentId: writeF }), await createFolder(ctx, "W b", { parentId: writeF }), await createFolder(ctx, "W c", { parentId: writeF })];
    const underManage = [await createFolder(ctx, "M a", { parentId: manageF }), await createFolder(ctx, "M b", { parentId: manageF }), await createFolder(ctx, "M c", { parentId: manageF })];
    checks.push(...levelChecks("POST /folders/:id/rename", "manage", await call("rename a folder with write", "POST", `/folders/${underWrite[0]?.id}/rename`, { name: "Renommé" }), await call("rename a folder with manage", "POST", `/folders/${underManage[0]?.id}/rename`, { name: "Renommé" })));
    checks.push(...levelChecks("POST /folders/:id/move", "manage", await call("move a folder with write", "POST", `/folders/${underWrite[1]?.id}/move`, { parentId: manageF2 }), await call("move a folder with manage", "POST", `/folders/${underManage[1]?.id}/move`, { parentId: manageF2 })));
    checks.push(check("POST /folders/:id/move: refused into a folder held with write only", refused(await call("move a managed folder under a write folder", "POST", `/folders/${underManage[2]?.id}/move`, { parentId: writeF2 })), "into write"));
    checks.push(...levelChecks("DELETE /folders/:id", "manage", await call("delete a folder with write", "DELETE", `/folders/${underWrite[2]?.id}`), await call("delete a folder with manage", "DELETE", `/folders/${underManage[2]?.id}`)));
    const stillThere = (await media(ctx, "the folders the member could not change", "GET", "/tree")).body;
    const names = list(stillThere, "folders").map((row) => text(row, "name"));
    checks.push(check("nothing refused changed: W a, W b, W c are still there with their names", ["W a", "W b", "W c"].every((name) => names.includes(name)), names.filter((name) => name.startsWith("W"))));
    await ctx.verify("each route at its right", checks);
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const structureChangesCoverEverySubfolder = {
  id: "structure-changes-cover-every-subfolder",
  title: "deleting a folder needs manage on every subfolder too: a member who manages a folder cannot delete it while a subfolder grants them only read, and everything stays; a folder zip leaves out the subfolders the member cannot read",
  entryPoint: "DELETE /api/media/folders/:id, POST /api/media/folders/:id/zip as a member",
  async run(/** @type {Ctx} */ ctx) {
    const parentKey = ctx.unique("verify.cascade");
    const parent = await declareFolder(ctx, { key: parentKey, name: ctx.unique("Cascade"), acl: [{ subject: { kind: "permission", id: "verify.cascade" }, rights: ["manage"] }] });
    const parentId = text(parent.body, "result", "id");
    const child = await declareFolder(ctx, { key: `${parentKey}.child`, name: "Lecture seule", parent: parentKey, acl: [{ subject: { kind: "permission", id: "verify.cascade" }, rights: ["read"] }] });
    const childId = text(child.body, "result", "id");
    const childFile = await uploaded(ctx, { folderId: childId, name: "garde.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
    const zipKey = ctx.unique("verify.ziplevel");
    const readable = await declareFolder(ctx, { key: zipKey, name: ctx.unique("Zip lecture"), acl: [{ subject: { kind: "permission", id: "verify.cascade" }, rights: ["read"] }] });
    const readableId = text(readable.body, "result", "id");
    const hidden = await declareFolder(ctx, { key: `${zipKey}.hidden`, name: "Caché", parent: zipKey, acl: [{ subject: { kind: "permission", id: "verify.someoneelse" }, rights: ["read"] }] });
    await uploaded(ctx, { folderId: readableId, name: "visible.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
    await uploaded(ctx, { folderId: text(hidden.body, "result", "id"), name: "secret.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
    await member(ctx, "cascader", ["verify.cascade"]);
    const removal = await media(ctx, "the member deletes the folder it manages", "DELETE", `/folders/${parentId}`, { as: "cascader" });
    const tree = (await media(ctx, "the tree after the refused delete", "GET", "/tree")).body;
    const ids = list(tree, "folders").map((row) => text(row, "id"));
    const kept = await media(ctx, "the subfolder's file", "GET", `/assets/${childFile.id}`);
    const zip = await raw(ctx, "the member zips the folder it reads", { path: `/api/media/folders/${readableId}/zip`, method: "POST", as: "cascader", headers: { "content-type": "application/json" }, body: Buffer.from("{}") });
    const entries = zip.status === 200 ? unzip(zip.bytes).map((entry) => entry.name) : [];
    await ctx.verify("subfolders count", [
      check("the delete is refused 403", removal.status === 403, [removal.status, removal.body]),
      check("the folder, its subfolder and the subfolder's file stay", ids.includes(parentId) && ids.includes(childId) && kept.status === 200, [ids.includes(parentId), ids.includes(childId), kept.status]),
      check("the zip holds the readable folder's file and nothing of the hidden subfolder", entries.includes("visible.png") && !entries.some((name) => name.includes("secret") || name.includes("Caché")), entries),
    ]);
  },
};

/**
 * Journeys of the exact right each route needs.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function permissionLevelJourneys() {
  return [everyRouteNeedsItsDocumentedRight, structureChangesCoverEverySubfolder];
}
