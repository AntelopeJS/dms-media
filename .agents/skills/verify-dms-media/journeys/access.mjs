import { guarded } from "../guard.mjs";
import { createFolder, declareFolder, member, tree, uploaded, withConfig } from "../library.mjs";
import { check, image, list, media, pick, text } from "../media.mjs";
import { hasRights, probeRights } from "./bindings.mjs";
import { boundFolder } from "./folders.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */

/**
 * A declared folder whose ACL grants one permission the given rights.
 *
 * @param {Ctx} ctx The journey
 * @param {string} permission The permission
 * @param {string[]} rights The rights
 * @returns {Promise<string>} The folder id
 */
async function aclFolder(ctx, permission, rights) {
  const answer = await declareFolder(ctx, { key: ctx.unique("verify.acl"), name: ctx.unique(`ACL ${rights.join(" ")}`), acl: [{ subject: { kind: "permission", id: permission }, rights }] });
  return text(answer.body, "result", "id");
}

const OWNER_ONLY_READS = ["/stats/kpis", "/stats/storage", "/stats/attention", "/stats/recent", "/activity", "/activity?type=uploads"];

/** Who may do what: owner-only pages and statistics, folder rights, owner-only visibility. */
export const journeys = guarded([
  {
    id: "every-media-route-needs-a-signed-in-member",
    title: "the /api/media routes answer 401 without a session",
    entryPoint: "GET /api/media/tree, /folders/:id/assets, /search, POST /folders as nobody",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Closed"));
      const calls = [
        await media(ctx, "tree as nobody", "GET", "/tree", { as: "anon" }),
        await media(ctx, "listing as nobody", "GET", `/folders/${folder.id}/assets`, { as: "anon" }),
        await media(ctx, "search as nobody", "GET", "/search?q=x", { as: "anon" }),
        await media(ctx, "create a folder as nobody", "POST", "/folders", { body: { name: "x" }, as: "anon" }),
      ];
      await ctx.verify("401 for each", calls.map((answer, index) => check(`call ${index + 1} is 401`, answer.status === 401, answer.status)));
    },
  },
  {
    id: "media-pages-and-statistics-are-owner-only",
    title: "a member, even one whose role holds the Library page permission, gets 403 from the overview and activity routes, cannot open the Media pages, and that permission grants no folder right",
    entryPoint: "GET /api/media/stats/*, /activity, /modules/media/* as a member",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Library"));
      await member(ctx, "libraryrole", ["modules.media.library.files", "page:fields"]);
      const answers = [];
      for (const path of OWNER_ONLY_READS) answers.push({ path, member: await media(ctx, `${path} as the member`, "GET", path, { as: "libraryrole" }), owner: await media(ctx, `${path} as the owner`, "GET", path) });
      const tab = await ctx.tab("libraryrole");
      await tab.signIn("libraryrole");
      const pages = [];
      for (const path of ["/modules/media/overview", "/modules/media/files", "/modules/media/uploads", "/modules/media/presets"]) {
        await tab.goto(path);
        await tab.visible({ role: "heading", level: 1 }, { timeoutMs: 15_000 });
        pages.push({ path, at: new URL(tab.page.url()).pathname, library: await tab.page.getByRole("textbox", { name: "Search the library" }).count(), sizes: await tab.page.getByRole("heading", { name: "thumb" }).count() });
      }
      await ctx.verify("owner-only", [
        ...answers.map((row) => check(`${row.path}: 403 for the member, 200 for the owner`, row.member.status === 403 && row.owner.status === 200, [row.member.status, row.owner.status])),
        ...pages.map((row) => check(`${row.path} is not shown to the member`, row.at !== row.path && row.library === 0 && row.sizes === 0, row)),
        hasRights(await probeRights(ctx, folder.id, "libraryrole"), "none", "the Library page permission grants no folder right"),
      ]);
    },
  },
  {
    id: "a-member-reaches-only-what-their-rights-open",
    title: "for a member, the folder of a binding they cannot see is null, the starter folders need manage at the root, a folder zips only with read, and bulk actions refuse the files they cannot reach",
    entryPoint: "GET /api/media/bindings/:id/folder, POST /folders/starter, POST /folders/:id/zip, POST /assets/bulk/* as a member",
    async run(/** @type {Ctx} */ ctx) {
      const managed = await aclFolder(ctx, "verify.limits", ["manage"]);
      const closed = await createFolder(ctx, ctx.unique("Closed"));
      const shut = await uploaded(ctx, { folderId: closed.id, name: "shut.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
      const open = await uploaded(ctx, { folderId: managed, name: "open.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
      await member(ctx, "limited", ["verify.limits"]);
      const binding = await media(ctx, "the cover field's folder as the member", "GET", "/bindings/verify.cover/folder", { as: "limited" });
      const starter = await media(ctx, "starter folders as the member", "POST", "/folders/starter", { body: { folders: [{ name: "Catalog", visibility: "private" }] }, as: "limited" });
      const zipClosed = await media(ctx, "zip the closed folder as the member", "POST", `/folders/${closed.id}/zip`, { body: {}, as: "limited" });
      const zipOpen = await media(ctx, "zip the managed folder as the member", "POST", `/folders/${managed}/zip`, { body: {}, as: "limited" });
      const bulk = await media(ctx, "bulk delete both files as the member", "POST", "/assets/bulk/delete", { body: { ids: [open.id, shut.id] }, as: "limited" });
      const shutStays = await media(ctx, "read the closed file as the owner", "GET", `/assets/${shut.id}`);
      await ctx.verify("each limit", [
        check("the binding's folder is null", binding.status === 200 && pick(binding.body, "folder") === null, binding.body),
        check("starter folders refused 403 without manage at the root", starter.status === 403, starter.status),
        check("a folder without read does not zip", zipClosed.status === 403 || zipClosed.status === 404, zipClosed.status),
        check("a folder with read zips", zipOpen.status === 200, zipOpen.status),
        check("bulk: the reachable file done, the other refused", JSON.stringify(pick(bulk.body, "done")) === JSON.stringify([open.id]) && JSON.stringify(list(bulk.body, "refused").map((row) => pick(row, "id"))) === JSON.stringify([shut.id]), bulk.body),
        check("the refused file is still there", shutStays.status === 200, shutStays.status),
      ]);
    },
  },
  {
    id: "rights-include-the-weaker-ones",
    title: "manage includes write and read, write includes read: read lists, write uploads and edits files, manage changes the folder structure",
    entryPoint: "folder ACLs, POST /api/media/folders, /upload/presign, /folders/:id/rename as a member",
    async run(/** @type {Ctx} */ ctx) {
      const readFolder = await aclFolder(ctx, "verify.r", ["read"]);
      const writeFolder = await aclFolder(ctx, "verify.w", ["write"]);
      const manageFolder = await aclFolder(ctx, "verify.m", ["manage"]);
      await member(ctx, "rights", ["verify.r", "verify.w", "verify.m"]);
      const subInWrite = await createFolder(ctx, "Sub", { parentId: writeFolder, as: "rights" });
      const subInManage = await createFolder(ctx, "Sub", { parentId: manageFolder, as: "rights" });
      const renameManaged = await media(ctx, "rename the subfolder", "POST", `/folders/${subInManage.id}/rename`, { body: { name: "Renamed" }, as: "rights" });
      await ctx.verify("each right and the weaker ones", [
        hasRights(await probeRights(ctx, readFolder, "rights"), "read", "read"),
        hasRights(await probeRights(ctx, writeFolder, "rights"), "write", "write"),
        hasRights(await probeRights(ctx, manageFolder, "rights"), "write", "manage includes write"),
        check("write cannot add a subfolder", subInWrite.answer.status === 403, subInWrite.answer.status),
        check("manage adds and renames subfolders", subInManage.answer.status === 200 && renameManaged.status === 200, [subInManage.answer.status, renameManaged.status]),
      ]);
    },
  },
  {
    id: "a-folder-without-an-acl-takes-its-parents",
    title: "a subfolder without its own ACL takes its parent's rights, a root folder takes rootAcl, which grants members nothing by default and opens every folder whose ancestors set no ACL when it names them",
    entryPoint: "rootAcl option, folder ACL inheritance",
    async run(/** @type {Ctx} */ ctx) {
      const parent = await aclFolder(ctx, "verify.parent", ["read"]);
      const child = await createFolder(ctx, "Child", { parentId: parent });
      const plain = await createFolder(ctx, ctx.unique("Plain"));
      const plainChild = await createFolder(ctx, "Plain child", { parentId: plain.id });
      const plainGrandchild = await createFolder(ctx, "Plain grandchild", { parentId: plainChild.id });
      await member(ctx, "inheritor", ["verify.parent", "verify.root"]);
      const inherited = await probeRights(ctx, child.id, "inheritor");
      const noRoot = await probeRights(ctx, plain.id, "inheritor");
      await withConfig(ctx, { VERIFY_MEDIA_ROOT_ACL: "permission:verify.root:write" }, async () => {
        const rooted = await probeRights(ctx, plain.id, "inheritor");
        const rootedChild = await probeRights(ctx, plainChild.id, "inheritor");
        const rootedGrandchild = await probeRights(ctx, plainGrandchild.id, "inheritor");
        const ownAcl = await probeRights(ctx, parent, "inheritor");
        await ctx.verify("the inheritance", [
          hasRights(inherited, "read", "the subfolder takes its parent's read"),
          hasRights(noRoot, "none", "the default rootAcl grants nothing"),
          hasRights(rooted, "write", "a rootAcl entry reaches a root folder without an ACL"),
          hasRights(rootedChild, "write", "and its subfolder, which sets no ACL either"),
          hasRights(rootedGrandchild, "write", "and the subfolder below that"),
          hasRights(ownAcl, "read", "a folder with its own ACL keeps it"),
        ]);
      });
    },
  },
  {
    id: "only-the-owner-changes-visibility",
    title: "a member who manages a folder cannot change a folder's or a file's visibility, nor move a file where its visibility would change, but moves it where it stays the same",
    entryPoint: "POST /api/media/folders/:id/visibility, /assets/:id/visibility, /assets/:id/move as a member",
    async run(/** @type {Ctx} */ ctx) {
      const privateA = await aclFolder(ctx, "verify.vis", ["manage"]);
      const privateB = await aclFolder(ctx, "verify.vis", ["manage"]);
      const publicC = await aclFolder(ctx, "verify.vis", ["manage"]);
      await media(ctx, "the owner publishes C", "POST", `/folders/${publicC}/visibility`, { body: { visibility: "public" } });
      const file = await uploaded(ctx, { folderId: privateA, name: "m.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
      await member(ctx, "manager", ["verify.vis"]);
      const folderVis = await media(ctx, "the member publishes A", "POST", `/folders/${privateA}/visibility`, { body: { visibility: "public" }, as: "manager" });
      const fileVis = await media(ctx, "the member publishes the file", "POST", `/assets/${file.id}/visibility`, { body: { visibility: "public" }, as: "manager" });
      const toPublic = await media(ctx, "the member moves it into the public folder", "POST", `/assets/${file.id}/move`, { body: { folderId: publicC }, as: "manager" });
      const toPrivate = await media(ctx, "the member moves it into another private folder", "POST", `/assets/${file.id}/move`, { body: { folderId: privateB }, as: "manager" });
      const ownerMove = await media(ctx, "the owner moves it into the public folder", "POST", `/assets/${file.id}/move`, { body: { folderId: publicC } });
      await ctx.verify("visibility is the owner's", [
        check("folder visibility refused 403", folderVis.status === 403, folderVis.status),
        check("file visibility refused 403", fileVis.status === 403, fileVis.status),
        check("a move that makes it public refused 403", toPublic.status === 403, toPublic.status),
        check("a move that keeps it private allowed", toPrivate.status === 200, toPrivate.body),
        check("the owner may", ownerMove.status === 200, ownerMove.body),
      ]);
    },
  },
  {
    id: "a-writer-of-a-linked-folder-changes-any-of-its-files",
    title: "a member who can write in a linked folder renames, describes, moves, edits and deletes a file the owner uploaded there",
    entryPoint: "POST /api/media/assets/:id/update, /move, /transform, DELETE as a member",
    async run(/** @type {Ctx} */ ctx) {
      const projects = await boundFolder(ctx, "verify.projects");
      const sub = await createFolder(ctx, "Lot", { parentId: projects });
      const file = await uploaded(ctx, { folderId: projects, name: "owner.png", mimetype: "image/png", bytes: await image(ctx, { width: 20, height: 10 }) });
      const other = await uploaded(ctx, { folderId: projects, name: "other.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
      await member(ctx, "fieldwriter", ["page:fields"]);
      const rename = await media(ctx, "rename", "POST", `/assets/${file.id}/update`, { body: { name: "renamed.png", alt: "Décrit par un membre" }, as: "fieldwriter" });
      const edit = await media(ctx, "rotate", "POST", `/assets/${file.id}/transform`, { body: { rotate: 90 }, as: "fieldwriter" });
      const move = await media(ctx, "move into the subfolder", "POST", `/assets/${file.id}/move`, { body: { folderId: sub.id }, as: "fieldwriter" });
      const remove = await media(ctx, "delete the other file", "DELETE", `/assets/${other.id}`, { as: "fieldwriter" });
      const read = await media(ctx, "read the file back", "GET", `/assets/${file.id}`);
      const gone = await media(ctx, "read the deleted file", "GET", `/assets/${other.id}`);
      const asset = pick(read.body, "asset");
      await ctx.verify("every change of a writer", [
        check("renamed and described", rename.status === 200 && pick(asset, "name") === "renamed.png" && pick(asset, "alt") === "Décrit par un membre", asset),
        check("edited: rotated to 10×20", edit.status === 200 && pick(asset, "width") === 10 && pick(asset, "height") === 20, [edit.status, asset]),
        check("moved", move.status === 200 && pick(asset, "folderId") === sub.id, asset),
        check("deleted", remove.status === 200 && gone.status === 404, [remove.status, gone.status]),
      ]);
      const seen = await tree(ctx, "fieldwriter");
      await ctx.verify("the member never reached a Media page right", [check("but sees the linked folder", seen.folders.some((folder) => pick(folder, "id") === projects), seen.folders.length)]);
    },
  },
]);
