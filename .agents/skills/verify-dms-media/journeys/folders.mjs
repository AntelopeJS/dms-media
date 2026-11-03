import { existsSync, readdirSync } from "node:fs";
import { guarded } from "../guard.mjs";
import { createFolder, folderAssets, follow, setVisibility, tree, uploaded } from "../library.mjs";
import { check, image, longText, media, names, pick, raw, recordRaw, sha256, storagePath, text, unzip } from "../media.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */

/**
 * The folder bound to an asset field of the verification playground.
 *
 * @param {Ctx} ctx The journey
 * @param {string} bindingId The binding
 * @returns {Promise<string>} The folder id
 */
export async function boundFolder(ctx, bindingId) {
  const answer = await media(ctx, `read the folder of ${bindingId}`, "GET", `/bindings/${bindingId}/folder`);
  return text(answer.body, "folder", "id") || text(answer.body, "id");
}

/**
 * Zips through the API and reads the archive.
 *
 * @param {Ctx} ctx The journey
 * @param {string} label What is zipped
 * @param {string} path The zip route under the media API
 * @param {unknown} body The JSON body
 * @returns {Promise<{ answer: import("../media.mjs").Raw, entries: { name: string, bytes: Buffer }[] }>} The answer and the archive's entries
 */
export async function zipped(ctx, label, path, body) {
  const answer = await raw(ctx, label, { path: `/api/media${path}`, method: "POST", as: "admin", headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify(body)) });
  return { answer, entries: answer.status === 200 ? unzip(answer.bytes) : [] };
}

/** Folders: names, rules, moves, visibility, deletion and zips. */
export const journeys = guarded([
  {
    id: "names-are-unique-whatever-their-case",
    title: "a folder name is unique among its siblings ignoring case and Unicode form, on create, rename and move, and the same name is fine elsewhere",
    entryPoint: "POST /api/media/folders, /folders/:id/rename, /folders/:id/move",
    async run(/** @type {Ctx} */ ctx) {
      const parent = await createFolder(ctx, ctx.unique("Parent"));
      const first = await createFolder(ctx, "Été", { parentId: parent.id });
      const sameCase = await createFolder(ctx, "ÉTÉ", { parentId: parent.id });
      const decomposed = await createFolder(ctx, "Été", { parentId: parent.id });
      const other = await createFolder(ctx, "Hiver", { parentId: parent.id });
      const rename = await media(ctx, "rename Hiver to été", "POST", `/folders/${other.id}/rename`, { body: { name: "été" } });
      const elsewhere = await createFolder(ctx, "Été");
      const move = await media(ctx, "move the root Été next to the other one", "POST", `/folders/${elsewhere.id}/move`, { body: { parentId: parent.id } });
      await ctx.verify("the name is taken in its folder only", [
        check("the first one is created", first.answer.status === 200, first.answer.body),
        check("ÉTÉ is refused 409", sameCase.answer.status === 409 && JSON.stringify(sameCase.answer.body).includes("folder_name_taken"), sameCase.answer.body),
        check("the decomposed form is refused 409", decomposed.answer.status === 409, decomposed.answer.body),
        check("renaming onto it is refused 409", rename.status === 409 && JSON.stringify(rename.body).includes("folder_name_taken"), rename.body),
        check("the same name at the root is fine", elsewhere.answer.status === 200, elsewhere.answer.body),
        check("moving it next to its twin is refused 409", move.status === 409, move.body),
      ]);
    },
  },
  {
    id: "names-windows-or-macos-cannot-save-are-refused",
    title: "a folder name with / \\ < > : \" | ? * or a control character, or over 255 characters, is refused 400 with an error key; a file name refuses / \\ and control characters only",
    entryPoint: "POST /api/media/folders, POST /api/media/assets/:id/update",
    async run(/** @type {Ctx} */ ctx) {
      const refused = [];
      for (const name of ["a/b", "a\\b", "a<b", "a>b", "a:b", 'a"b', "a|b", "a?b", "a*b", "a\u0001b", "x".repeat(256), "   "]) {
        const answer = await createFolder(ctx, name);
        refused.push(check(`folder ${JSON.stringify(name.slice(0, 20))} refused`, answer.answer.status === 400 && JSON.stringify(answer.answer.body).includes("$dms_media.errors."), answer.answer.body));
      }
      const fine = await createFolder(ctx, `${"y".repeat(250)} été`);
      const folder = await createFolder(ctx, ctx.unique("Files"));
      const file = await uploaded(ctx, { folderId: folder.id, name: "f.txt", mimetype: "text/plain", bytes: Buffer.from("f") });
      const colon = await media(ctx, "rename the file with a colon", "POST", `/assets/${file.id}/update`, { body: { name: "a:b?.txt" } });
      const slash = await media(ctx, "rename the file with a slash", "POST", `/assets/${file.id}/update`, { body: { name: "a/b.txt" } });
      await ctx.verify("the rules", [
        ...refused,
        check("255 characters are fine", fine.answer.status === 200, fine.answer.body),
        check("a file name refuses names Windows or macOS cannot save, like a folder", colon.status === 400, colon.body),
        check("a file name refuses a slash", slash.status === 400 && JSON.stringify(slash.body).includes("name_forbidden"), slash.body),
      ]);
    },
  },
  {
    id: "rename-move-and-visibility-show-in-the-tree",
    title: "a renamed, moved and published folder reads back so in the tree and its impact; a folder cannot move inside itself; folder visibility reaches its direct files only",
    entryPoint: "POST /api/media/folders/:id/rename, /move, /visibility, GET /tree, GET /folders/:id/impact",
    async run(/** @type {Ctx} */ ctx) {
      const top = await createFolder(ctx, ctx.unique("Top"));
      const child = await createFolder(ctx, "Child", { parentId: top.id });
      const grand = await createFolder(ctx, "Grand", { parentId: child.id });
      const target = await createFolder(ctx, ctx.unique("Target"));
      const inTop = await uploaded(ctx, { folderId: top.id, name: "top.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
      const inChild = await uploaded(ctx, { folderId: child.id, name: "child.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
      const renamed = await media(ctx, "rename Child", "POST", `/folders/${child.id}/rename`, { body: { name: "Enfant" } });
      const moved = await media(ctx, "move Enfant under Target", "POST", `/folders/${child.id}/move`, { body: { parentId: target.id } });
      const inside = await media(ctx, "move Enfant inside its own child", "POST", `/folders/${child.id}/move`, { body: { parentId: grand.id } });
      const published = await setVisibility(ctx, "folders", top.id, "public");
      const read = await tree(ctx);
      const byId = new Map(read.folders.map((folder) => [text(folder, "id"), folder]));
      const topFile = await raw(ctx, "the file of the public folder, anonymously", { path: `/media/${inTop.id}/top.png` });
      const impact = await media(ctx, "read Target's impact", "GET", `/folders/${target.id}/impact`);
      const publishedChild = await setVisibility(ctx, "folders", target.id, "public");
      const childFile = await raw(ctx, "the file of a subfolder of a public folder, anonymously", { path: `/media/${inChild.id}/child.png` });
      await ctx.verify("the tree reads the changes back", [
        check("renamed", renamed.status === 200 && pick(byId.get(child.id), "name") === "Enfant", byId.get(child.id)),
        check("moved under Target", moved.status === 200 && pick(byId.get(child.id), "parentId") === target.id, byId.get(child.id)),
        check("a folder cannot move inside itself", inside.status === 400, inside.body),
        check("published", published.status === 200 && pick(byId.get(top.id), "visibility") === "public", byId.get(top.id)),
        check("a direct file of the public folder opens anonymously", topFile.status === 302, topFile.status),
        check("impact counts the moved subtree", pick(impact.body, "subfolders") === 2 && pick(impact.body, "files") === 1, impact.body),
        check("Target made public", publishedChild.status === 200, publishedChild.body),
        check("Grand stays private: a subfolder does not inherit", pick(byId.get(grand.id), "visibility") === "private", byId.get(grand.id)),
        check("the file of Enfant, a subfolder, stays private", childFile.status === 401, childFile.status),
      ]);
    },
  },
  {
    id: "delete-takes-only-its-own-files",
    title: "deleting a folder removes its subfolders, their files and stored bytes, and leaves every other folder and file as it was",
    entryPoint: "DELETE /api/media/folders/:id",
    async run(/** @type {Ctx} */ ctx) {
      const doomed = await createFolder(ctx, ctx.unique("Doomed"));
      const sub = await createFolder(ctx, "Sub", { parentId: doomed.id });
      const kept = await createFolder(ctx, ctx.unique("Kept"));
      const bytes = await image(ctx, { width: 8, height: 8 });
      const gone = await uploaded(ctx, { folderId: sub.id, name: "gone.png", mimetype: "image/png", bytes });
      const stays = await uploaded(ctx, { folderId: kept.id, name: "stays.png", mimetype: "image/png", bytes });
      const impact = await media(ctx, "read the impact", "GET", `/folders/${doomed.id}/impact`);
      const removed = await media(ctx, "delete the folder", "DELETE", `/folders/${doomed.id}`);
      const read = await tree(ctx);
      const ids = read.folders.map((folder) => text(folder, "id"));
      const goneLink = await raw(ctx, "the deleted file's link", { path: `/media/${gone.id}/gone.png`, as: "admin" });
      const keptFile = await follow(ctx, `/media/${stays.id}/stays.png`, { as: "admin" });
      const subStorage = storagePath(ctx, "files", "media", "default", sub.id);
      await ctx.verify("only the folder's own content is gone", [
        check("impact named what goes", pick(impact.body, "subfolders") === 1 && pick(impact.body, "files") === 1 && pick(impact.body, "size") === bytes.byteLength, impact.body),
        check("deleted", removed.status === 200, removed.body),
        check("both folders are gone", !ids.includes(doomed.id) && !ids.includes(sub.id), ids),
        check("the other folder stays", ids.includes(kept.id), ids),
        check("the deleted file's link is 404", goneLink.status === 404, goneLink.status),
        check("its stored bytes are gone", !existsSync(subStorage) || readdirSync(subStorage).length === 0, subStorage),
        check("the other file still serves its bytes", keptFile.file !== null && sha256(keptFile.file.bytes) === sha256(bytes), keptFile.link.status),
      ]);
    },
  },
  {
    id: "starter-folders-need-manage-at-the-root",
    title: "the starter folders are created at the root by the owner, refused 409 when a root folder already has the name",
    entryPoint: "POST /api/media/folders/starter",
    async run(/** @type {Ctx} */ ctx) {
      const folders = ["Catalog", "Marketing", "Brand", "Documents"].map((name) => ({ name, visibility: name === "Brand" ? "public" : "private" }));
      const created = await media(ctx, "create the starter folders", "POST", "/folders/starter", { body: { folders } });
      const again = await media(ctx, "create them again", "POST", "/folders/starter", { body: { folders } });
      const read = await tree(ctx);
      const roots = read.folders.filter((folder) => !pick(folder, "parentId"));
      await ctx.verify("the four folders are at the root", [
        check("created", created.status === 200, created.body),
        check("all four at the root", ["Catalog", "Marketing", "Brand", "Documents"].every((name) => names(roots).includes(name)), names(roots)),
        check("with their visibility", pick(roots.find((folder) => pick(folder, "name") === "Brand"), "visibility") === "public", roots),
        check("refused the second time", again.status === 409, again.body),
      ]);
    },
  },
  {
    id: "zips-hold-files-and-subfolders-within-limits",
    title: "a selection zips into media.zip with every byte of each file, a folder zips with its subfolders as directories, and more than 200 files are refused 413",
    entryPoint: "POST /api/media/assets/zip, POST /api/media/folders/:id/zip",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, "Été 2026");
      const sub = await createFolder(ctx, "Sous-dossier", { parentId: folder.id });
      const text1 = longText(20_000);
      const png = await image(ctx, { width: 30, height: 30 });
      const a = await uploaded(ctx, { folderId: folder.id, name: "notes été.txt", mimetype: "text/plain", bytes: text1 });
      const b = await uploaded(ctx, { folderId: sub.id, name: "image.png", mimetype: "image/png", bytes: png });
      const selection = await zipped(ctx, "zip a selection", "/assets/zip", { ids: [a.id, b.id] });
      const whole = await zipped(ctx, "zip the folder", `/folders/${folder.id}/zip`, {});
      /** @param {{ name: string, bytes: Buffer }[]} entries @param {string} name @returns {string} */
      const hash = (entries, name) => sha256(entries.find((entry) => entry.name === name)?.bytes ?? Buffer.alloc(0));
      recordRaw(ctx, selection.answer, [
        check("200 application/zip", selection.answer.status === 200 && (selection.answer.headers["content-type"] ?? "").startsWith("application/zip"), selection.answer.headers),
        check("named media.zip", (selection.answer.headers["content-disposition"] ?? "").includes('filename="media.zip"'), selection.answer.headers["content-disposition"]),
        check("both files, every byte", hash(selection.entries, "notes été.txt") === sha256(text1) && hash(selection.entries, "image.png") === sha256(png), selection.entries.map((entry) => entry.name)),
      ]);
      recordRaw(ctx, whole.answer, [
        check("named after the folder, in UTF-8", (whole.answer.headers["content-disposition"] ?? "").includes(`filename*=UTF-8''${encodeURIComponent("Été 2026.zip")}`), whole.answer.headers["content-disposition"]),
        check("the subfolder is a directory", hash(whole.entries, "Sous-dossier/image.png") === sha256(png) && hash(whole.entries, "notes été.txt") === sha256(text1), whole.entries.map((entry) => entry.name)),
      ]);
      const many = await createFolder(ctx, ctx.unique("Many"));
      const ids = [];
      for (let index = 0; index < 201; index += 1) {
        const done = await uploaded(ctx, { folderId: many.id, name: `f${index}.txt`, mimetype: "text/plain", bytes: Buffer.from(String(index)) });
        ids.push(done.id);
      }
      const tooMany = await zipped(ctx, "zip 201 files", "/assets/zip", { ids });
      const atMost = await zipped(ctx, "zip 200 files", "/assets/zip", { ids: ids.slice(0, 200) });
      const folderTooMany = await zipped(ctx, "zip the folder of 201 files", `/folders/${many.id}/zip`, {});
      await ctx.verify("a zip holds at most 200 files", [
        check("201 refused 413", tooMany.answer.status === 413, tooMany.answer.status),
        check("200 accepted", atMost.answer.status === 200 && atMost.entries.length === 200, `${atMost.answer.status} ${atMost.entries.length}`),
        check("a folder of 201 refused 413", folderTooMany.answer.status === 413, folderTooMany.answer.status),
      ]);
      const listed = await folderAssets(ctx, many.id, { query: "limit=500" });
      await ctx.verify("the listing pages up to 500", [check("all 201 in one page", listed.assets.length === 201, listed.assets.length)]);
    },
  },
]);
