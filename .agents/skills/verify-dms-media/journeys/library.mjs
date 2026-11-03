import { guarded } from "../guard.mjs";
import { createFolder, setVisibility, tree, uploaded } from "../library.mjs";
import { check, image, list, media, names, pick } from "../media.mjs";
import { explorerJourneys } from "./parts/explorer.mjs";
import { shortcutJourneys } from "./parts/shortcuts.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */

/**
 * @param {Ctx} ctx The journey
 * @param {string} q The search
 * @param {string} [folderId] The folder it stays in
 * @returns {Promise<{ files: string[], folders: string[] }>} The file and folder names found
 */
async function search(ctx, q, folderId) {
  const answer = await media(ctx, `search ${JSON.stringify(q)}`, "GET", `/search?q=${encodeURIComponent(q)}${folderId ? `&folderId=${folderId}` : ""}`);
  return { files: names(answer.body, "assets").sort(), folders: names(answer.body, "folders").sort() };
}

/** Browsing the library: search, smart views, facets, sort and paging. */
export const journeys = guarded([
  {
    id: "search-matches-every-word-ignoring-accents-case-and-punctuation",
    title: "every word must appear in the file's name, alt text or folder path, in any order, at least one in the name or alt; accents, case and punctuation are ignored; folder names match too; an empty search finds nothing; a folder scope keeps to it and its subfolders",
    entryPoint: "GET /api/media/search?q=&folderId=",
    async run(/** @type {Ctx} */ ctx) {
      const archives = await createFolder(ctx, "Archives Été");
      const sub = await createFolder(ctx, "Sous-dossier", { parentId: archives.id });
      const other = await createFolder(ctx, "Ailleurs");
      const photo = await uploaded(ctx, { folderId: archives.id, name: "Été à Paris.jpg", mimetype: "image/jpeg", bytes: await image(ctx, { width: 4, height: 4, format: "jpeg" }) });
      await media(ctx, "describe it", "POST", `/assets/${photo.id}/update`, { body: { alt: "La tour Eiffel au crépuscule" } });
      await uploaded(ctx, { folderId: sub.id, name: "rapport-final_v2.pdf", mimetype: "application/pdf", bytes: Buffer.from("%PDF-1.4\n") });
      await uploaded(ctx, { folderId: other.id, name: "rapport ailleurs.pdf", mimetype: "application/pdf", bytes: Buffer.from("%PDF-1.4\n") });
      const cases = [
        ["ete paris", ["Été à Paris.jpg"]],
        ["PARIS été", ["Été à Paris.jpg"]],
        ["eiffel CREPUSCULE", ["Été à Paris.jpg"]],
        ["archives rapport", ["rapport-final_v2.pdf"]],
        ["rapport final v2", ["rapport-final_v2.pdf"]],
        ["archives", []],
        ["paris absent", []],
        ["rapport", ["rapport ailleurs.pdf", "rapport-final_v2.pdf"]],
      ];
      const results = [];
      for (const [q, expected] of cases) {
        const found = await search(ctx, String(q));
        results.push(check(`${JSON.stringify(q)} finds ${JSON.stringify(expected)}`, JSON.stringify(found.files) === JSON.stringify(expected), found.files));
      }
      const scoped = await search(ctx, "rapport", archives.id);
      const folderHit = await search(ctx, "sous dossier");
      const empty = await search(ctx, "   ");
      await ctx.verify("the search rules", [
        ...results,
        check("a scoped search keeps to the folder and its subfolders", JSON.stringify(scoped.files) === JSON.stringify(["rapport-final_v2.pdf"]), scoped.files),
        check("a folder name matches", folderHit.folders.includes("Sous-dossier"), folderHit.folders),
        check("an empty search finds nothing", empty.files.length === 0 && empty.folders.length === 0, empty),
      ]);
    },
  },
  {
    id: "smart-views-gather-files-across-folders",
    title: "Recent, Starred, Largest files, Public and Missing alt text gather the files of every folder, the tree counts them, and a view can stay inside one folder",
    entryPoint: "GET /api/media/views/:view, POST /api/media/favorites",
    async run(/** @type {Ctx} */ ctx) {
      const one = await createFolder(ctx, ctx.unique("One"));
      const two = await createFolder(ctx, ctx.unique("Two"));
      const small = await uploaded(ctx, { folderId: one.id, name: "small.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
      const big = await uploaded(ctx, { folderId: two.id, name: "big.png", mimetype: "image/png", bytes: await image(ctx, { width: 300, height: 300 }) });
      const doc = await uploaded(ctx, { folderId: two.id, name: "doc.txt", mimetype: "text/plain", bytes: Buffer.from("x") });
      await media(ctx, "describe the small image", "POST", `/assets/${small.id}/update`, { body: { alt: "Petit" } });
      await media(ctx, "star the document", "POST", "/favorites", { body: { kind: "asset", targetId: doc.id, starred: true } });
      await media(ctx, "star folder Two", "POST", "/favorites", { body: { kind: "folder", targetId: two.id, starred: true } });
      await setVisibility(ctx, "assets", big.id, "public");
      /** @param {string} view @param {string} [query] @returns {Promise<{ files: string[], folders: string[] }>} */
      const read = async (view, query = "") => {
        const answer = await media(ctx, `view ${view}${query}`, "GET", `/views/${view}${query}`);
        return { files: names(answer.body, "assets"), folders: names(answer.body, "folders") };
      };
      const recent = await read("recent");
      const starred = await read("starred");
      const largest = await read("largest");
      const open = await read("public");
      const missing = await read("missing-alt");
      const scoped = await read("largest", `?folderId=${one.id}`);
      const read2 = await tree(ctx);
      await ctx.verify("each view", [
        check("Recent: newest first", JSON.stringify(recent.files.slice(0, 3)) === JSON.stringify(["doc.txt", "big.png", "small.png"]), recent.files),
        check("Starred: the starred file and folder", starred.files.includes("doc.txt") && !starred.files.includes("big.png") && starred.folders.includes(String(pick(read2.folders.find((folder) => pick(folder, "id") === two.id), "name"))), starred),
        check("Largest files: biggest first", largest.files[0] === "big.png", largest.files),
        check("Public", JSON.stringify(open.files) === JSON.stringify(["big.png"]), open.files),
        check("Missing alt text: images without alt only", missing.files.includes("big.png") && !missing.files.includes("small.png") && !missing.files.includes("doc.txt"), missing.files),
        check("a view inside one folder", JSON.stringify(scoped.files) === JSON.stringify(["small.png"]), scoped.files),
        check("the tree counts the starred file and folder, and missing alt", pick(read2.answer.body, "views", "starred") === 2 && Number(pick(read2.answer.body, "views", "missingAlt")) >= 1, pick(read2.answer.body, "views")),
        check("a starred folder is marked in the tree", pick(read2.folders.find((folder) => pick(folder, "id") === two.id), "starred") === true, read2.folders.length),
      ]);
    },
  },
  {
    id: "facets-sort-and-paging-narrow-a-listing",
    title: "a folder listing narrows by type, visibility, modification date and orientation, sorts by name, date added, size or type in either direction, and pages with offset and a limit of at most 500",
    entryPoint: "GET /api/media/folders/:id/assets?type=&visibility=&modified=&orientation=&sort=&direction=&offset=&limit=",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Facets"));
      const wide = await uploaded(ctx, { folderId: folder.id, name: "c-wide.png", mimetype: "image/png", bytes: await image(ctx, { width: 60, height: 20 }) });
      await uploaded(ctx, { folderId: folder.id, name: "a-tall.png", mimetype: "image/png", bytes: await image(ctx, { width: 20, height: 60 }) });
      await uploaded(ctx, { folderId: folder.id, name: "b-square.png", mimetype: "image/png", bytes: await image(ctx, { width: 30, height: 30 }) });
      await uploaded(ctx, { folderId: folder.id, name: "d-doc.pdf", mimetype: "application/pdf", bytes: Buffer.alloc(9000, 37) });
      await setVisibility(ctx, "assets", wide.id, "public");
      /** @param {string} query @returns {Promise<string[]>} */
      const listing = async (query) => names((await media(ctx, `list ?${query}`, "GET", `/folders/${folder.id}/assets?${query}`)).body, "assets");
      const tooBig = await media(ctx, "limit 501", "GET", `/folders/${folder.id}/assets?limit=501`);
      await ctx.verify("each facet and order", [
        check("type image", JSON.stringify(await listing("type=image")) === JSON.stringify(["a-tall.png", "b-square.png", "c-wide.png"]), "type"),
        check("type pdf", JSON.stringify(await listing("type=pdf")) === JSON.stringify(["d-doc.pdf"]), "pdf"),
        check("visibility public", JSON.stringify(await listing("visibility=public")) === JSON.stringify(["c-wide.png"]), "public"),
        check("visibility private", (await listing("visibility=private")).length === 3, "private"),
        check("modified in 7 days: all", (await listing("modified=7d")).length === 4, "7d"),
        check("orientation landscape", JSON.stringify(await listing("orientation=landscape")) === JSON.stringify(["c-wide.png"]), "landscape"),
        check("orientation portrait", JSON.stringify(await listing("orientation=portrait")) === JSON.stringify(["a-tall.png"]), "portrait"),
        check("orientation square", JSON.stringify(await listing("orientation=square")) === JSON.stringify(["b-square.png"]), "square"),
        check("name descending", JSON.stringify(await listing("sort=name&direction=desc")) === JSON.stringify(["d-doc.pdf", "c-wide.png", "b-square.png", "a-tall.png"]), "name desc"),
        check("date added ascending is the upload order", JSON.stringify(await listing("sort=date&direction=asc")) === JSON.stringify(["c-wide.png", "a-tall.png", "b-square.png", "d-doc.pdf"]), "date"),
        check("size descending starts with the PDF", (await listing("sort=size&direction=desc"))[0] === "d-doc.pdf", "size"),
        check("type ascending puts images and the document apart", (await listing("sort=type&direction=asc")).indexOf("d-doc.pdf") !== 1 && (await listing("sort=type&direction=asc")).indexOf("d-doc.pdf") !== 2, "type sort"),
        check("offset and limit page", JSON.stringify(await listing("offset=1&limit=2")) === JSON.stringify(["b-square.png", "c-wide.png"]), "page"),
        check("a limit over 500 is refused", tooBig.status === 400, tooBig.status),
      ]);
      await ctx.verify("the listing's own shape", [check("the facets left the rows' order alone", list((await media(ctx, "plain listing", "GET", `/folders/${folder.id}/assets`)).body, "assets").length === 4, "plain")]);
    },
  },
  ...explorerJourneys(),
  ...shortcutJourneys(),
]);
