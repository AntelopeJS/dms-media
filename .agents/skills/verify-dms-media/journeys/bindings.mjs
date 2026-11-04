import { guarded } from "../guard.mjs";
import { createFolder, member, tree, upload, uploaded } from "../library.mjs";
import { check, fixture, image, media, pick, text } from "../media.mjs";
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
  const listed = await media(ctx, `${as} lists the folder`, "GET", `/folders/${folderId}/assets`, { as });
  const presign = await media(ctx, `${as} presigns into the folder`, "POST", "/upload/presign", { body: { folderId, filename: "probe.png", size: 10, mimetype: "image/png" }, as });
  return { read: listed.status === 200, write: presign.status === 200 };
}

/**
 * @param {{ read: boolean, write: boolean }} got The rights observed
 * @param {string} wanted `none`, `read` or `write`
 * @param {string} label Who, where
 * @returns {import("../media.mjs").Check} The check
 */
export function hasRights(got, wanted, label) {
  const expected = { none: { read: false, write: false }, read: { read: true, write: false }, write: { read: true, write: true } }[wanted];
  return check(`${label}: ${wanted}`, got.read === expected?.read && got.write === expected?.write, got);
}

/**
 * Registers a binding at run time through the fixture's `RegisterAssetBinding`, then reads its folder.
 *
 * @param {Ctx} ctx The journey
 * @param {Record<string, unknown>} config The binding
 * @returns {Promise<string>} Its folder id once provisioned
 */
async function bind(ctx, config) {
  await fixture(ctx, `RegisterAssetBinding ${String(config.id)}`, "POST", "/binding", config);
  return boundFolder(ctx, String(config.id));
}

/** Folder bindings: the folders asset fields upload into, provisioned per tenant under Content. */
export const journeys = guarded([
  {
    id: "bound-folders-live-under-a-private-content-root",
    title: "each registered binding has a folder under a private Content root, named folderName or the binding id, accepting its field's types",
    entryPoint: "AssetType binding, GET /api/media/tree, GET /api/media/bindings/:id/folder",
    async run(/** @type {Ctx} */ ctx) {
      const read = await tree(ctx);
      const content = read.folders.find((folder) => pick(folder, "link", "isContentRoot") === true);
      const byBinding = new Map(read.folders.map((folder) => [text(folder, "binding"), folder]));
      const cover = await media(ctx, "read the cover field's folder", "GET", "/bindings/verify.cover/folder");
      await ctx.verify("the provisioned folders", [
        check("a Content root, private, at the root", text(content, "name") === "Content" && pick(content, "visibility") === "private" && pick(content, "parentId") === null, content),
        check("the cover folder is named folderName, under Content", pick(byBinding.get("verify.cover"), "name") === "Verify covers" && pick(byBinding.get("verify.cover"), "parentId") === text(content, "id"), byBinding.get("verify.cover")),
        check("the sheets folder, without folderName, is named by its id", pick(byBinding.get("verify.sheets"), "name") === "verify.sheets", byBinding.get("verify.sheets")),
        check("bound folders are private", pick(byBinding.get("verify.sheets"), "visibility") === "private", byBinding.get("verify.sheets")),
        check("the folder accepts its field's types", JSON.stringify(pick(byBinding.get("verify.sheets"), "accepts")) === JSON.stringify(["application/pdf"]), byBinding.get("verify.sheets")),
        check("the binding route answers the same folder with the upload limits", text(cover.body, "folder", "id") === text(byBinding.get("verify.cover"), "id") && pick(cover.body, "maxUploadBytes") === 524288000 && Array.isArray(pick(cover.body, "allowedMimetypes")), cover.body),
      ]);
    },
  },
  {
    id: "a-second-registration-replaces-the-first",
    title: "registering the same binding id again replaces it: the folder keeps its name and takes the new ACL; unregistering leaves the folder and its files in place",
    entryPoint: "RegisterAssetBinding, UnregisterAssetBinding",
    async run(/** @type {Ctx} */ ctx) {
      const id = ctx.unique("verify.runtime").toLowerCase().replace(/[^a-z0-9.]+/g, "-");
      const first = await bind(ctx, { id, folderName: "Runtime A", acl: [{ subject: { kind: "permission", id: "verify.old" }, rights: ["write"] }] });
      await member(ctx, "olduser", ["verify.old"]);
      await member(ctx, "newuser", ["verify.new"]);
      const before = { old: await probeRights(ctx, first, "olduser"), fresh: await probeRights(ctx, first, "newuser") };
      const second = await bind(ctx, { id, folderName: "Runtime B", acl: [{ subject: { kind: "permission", id: "verify.new" }, rights: ["read"] }] });
      const after = { old: await probeRights(ctx, second, "olduser"), fresh: await probeRights(ctx, second, "newuser") };
      const read = await tree(ctx);
      const bound = read.folders.filter((folder) => pick(folder, "binding") === id);
      const file = await uploaded(ctx, { folderId: second, name: "kept.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
      await fixture(ctx, "UnregisterAssetBinding", "DELETE", `/binding/${id}`);
      const afterRemoval = await tree(ctx);
      const stillThere = afterRemoval.folders.find((folder) => pick(folder, "id") === second);
      const fileStays = await media(ctx, "read the file after unregistering", "GET", `/assets/${file.id}`);
      await ctx.verify("one binding, replaced", [
        hasRights(before.old, "write", "before: the old permission"),
        hasRights(before.fresh, "none", "before: the new permission"),
        check("the same folder", second === first && bound.length === 1, bound),
        check("it keeps its first name", pick(bound[0], "name") === "Runtime A", bound[0]),
        hasRights(after.old, "none", "after: the old permission"),
        hasRights(after.fresh, "read", "after: the new permission"),
        check("the folder stays after UnregisterAssetBinding", stillThere !== undefined, stillThere),
        check("its file stays", fileStays.status === 200, fileStays.status),
      ]);
    },
  },
  {
    id: "a-linked-folder-is-locked",
    title: "a linked folder cannot be renamed, moved or deleted, holds no subfolder unless its binding allows them, and a subfolder of an allowing binding can be created and renamed",
    entryPoint: "POST /api/media/folders/:id/rename, /move, DELETE /folders/:id, POST /folders on a linked folder",
    async run(/** @type {Ctx} */ ctx) {
      const cover = await boundFolder(ctx, "verify.cover");
      const projects = await boundFolder(ctx, "verify.projects");
      const elsewhere = await createFolder(ctx, ctx.unique("Elsewhere"));
      const rename = await media(ctx, "rename the linked folder", "POST", `/folders/${cover}/rename`, { body: { name: "Renamed" } });
      const move = await media(ctx, "move the linked folder", "POST", `/folders/${cover}/move`, { body: { parentId: elsewhere.id } });
      const remove = await media(ctx, "delete the linked folder", "DELETE", `/folders/${cover}`);
      const child = await createFolder(ctx, "Inside", { parentId: cover });
      const moveInto = await media(ctx, "move a folder into the linked folder", "POST", `/folders/${elsewhere.id}/move`, { body: { parentId: cover } });
      const sub = await createFolder(ctx, "Projet 1", { parentId: projects });
      const subRename = await media(ctx, "rename the subfolder", "POST", `/folders/${sub.id}/rename`, { body: { name: "Projet un" } });
      const projectsRename = await media(ctx, "rename the allowing linked folder", "POST", `/folders/${projects}/rename`, { body: { name: "Nope" } });
      await ctx.verify("the linked folder is locked", [
        check("rename refused", rename.status >= 400, rename.status),
        check("move refused", move.status >= 400, move.status),
        check("delete refused", remove.status >= 400, remove.status),
        check("no subfolder: 403 bound_parent", child.answer.status === 403 && JSON.stringify(child.answer.body).includes("bound_parent"), child.answer.body),
        check("no folder moved in: 403 bound_parent", moveInto.status === 403 && JSON.stringify(moveInto.body).includes("bound_parent"), moveInto.body),
        check("subfolders: true allows one", sub.answer.status === 200, sub.answer.body),
        check("which is not locked", subRename.status === 200, subRename.body),
        check("the allowing linked folder itself stays locked", projectsRename.status >= 400, projectsRename.status),
      ]);
    },
  },
  {
    id: "acl-precedence-follows-the-documented-order",
    title: "an explicit acl, [] included, replaces every derived entry; a permissionMapping right takes precedence over the page one right at a time and [] turns that right off; a right with no mapping falls back to the page's permission",
    entryPoint: "RegisterAssetBinding acl, permissionMapping, permissionsFromPage",
    async run(/** @type {Ctx} */ ctx) {
      const stamp = ctx.unique("p").toLowerCase().replace(/[^a-z0-9.]+/g, "-");
      const empty = await bind(ctx, { id: `${stamp}.empty`, acl: [], permissionMapping: { read: ["verify.reader"] }, permissionsFromPage: "fields" });
      const mapped = await bind(ctx, { id: `${stamp}.mapped`, permissionMapping: { read: ["verify.reader"] }, permissionsFromPage: "fields" });
      const noWrite = await bind(ctx, { id: `${stamp}.nowrite`, permissionMapping: { write: [] }, permissionsFromPage: "fields" });
      const writeMap = await bind(ctx, { id: `${stamp}.write`, permissionMapping: { write: ["verify.writer"] } });
      const noRead = await bind(ctx, { id: `${stamp}.noread`, permissionMapping: { read: [], write: ["verify.writer"] }, permissionsFromPage: "fields" });
      await member(ctx, "pageuser", ["page:fields"]);
      await member(ctx, "reader", ["verify.reader"]);
      await member(ctx, "writer", ["verify.writer"]);
      await ctx.verify("each rule in its order", [
        hasRights(await probeRights(ctx, empty, "reader"), "none", "acl [] replaces the mapping: the read mapping"),
        hasRights(await probeRights(ctx, empty, "pageuser"), "none", "acl [] replaces the page"),
        hasRights(await probeRights(ctx, mapped, "reader"), "read", "a read mapping grants read"),
        hasRights(await probeRights(ctx, mapped, "pageuser"), "write", "write falls back to the page, and write includes read"),
        hasRights(await probeRights(ctx, noWrite, "pageuser"), "read", "write [] turns the write fallback off; read falls back to the page"),
        hasRights(await probeRights(ctx, writeMap, "writer"), "write", "a write mapping grants write, which includes read"),
        hasRights(await probeRights(ctx, writeMap, "pageuser"), "none", "no page, no fallback"),
        hasRights(await probeRights(ctx, noRead, "pageuser"), "none", "read [] turns the read fallback off: the page user, whose write is mapped away too"),
        hasRights(await probeRights(ctx, noRead, "writer"), "write", "read [] leaves the write mapping, which includes read"),
      ]);
    },
  },
  {
    id: "a-field-folder-takes-its-page-rights",
    title: "a member whose role grants the field's page explicitly sees and uploads into the field's folder and its subfolders; a page held through memberAccess grants no folder right",
    entryPoint: "AssetType permissionsFromPage, GET /api/media/tree as a member",
    async run(/** @type {Ctx} */ ctx) {
      const cover = await boundFolder(ctx, "verify.cover");
      const projects = await boundFolder(ctx, "verify.projects");
      const open = await boundFolder(ctx, "verify.open");
      const sub = await createFolder(ctx, "Projet B", { parentId: projects });
      await member(ctx, "editor", ["page:fields"]);
      await member(ctx, "plain", ["unrelated.page"]);
      await member(ctx, "granted", ["page:open"]);
      const seen = await tree(ctx, "editor");
      const plainSeen = await tree(ctx, "plain");
      const done = await upload(ctx, { folderId: cover, name: "editor.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }), as: "editor" });
      await ctx.verify("the page grant reaches the folder", [
        check("the editor sees the field's folder and its subfolder", seen.folders.some((folder) => pick(folder, "id") === cover) && seen.folders.some((folder) => pick(folder, "id") === sub.id), seen.folders.map((folder) => pick(folder, "name"))),
        check("the editor uploads there", done.id !== "", done.confirm?.body),
        hasRights(await probeRights(ctx, sub.id, "editor"), "write", "the subfolder inherits the linked folder's ACL"),
        check("a member without the page sees none of it", !plainSeen.folders.some((folder) => [cover, projects, open].includes(text(folder, "id"))), plainSeen.folders.map((folder) => pick(folder, "name"))),
        hasRights(await probeRights(ctx, open, "plain"), "none", "memberAccess grants no folder right"),
        hasRights(await probeRights(ctx, open, "granted"), "write", "an explicit grant of the same page does"),
      ]);
    },
  },
]);
