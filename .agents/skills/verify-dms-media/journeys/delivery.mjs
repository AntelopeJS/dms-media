import { guarded } from "../guard.mjs";
import { createFolder, dashboardSession, declareFolder, deliveryPath, follow, member, setVisibility, uploaded } from "../library.mjs";
import { check, image, longText, media, pick, raw, recordRaw, sha256, signedLifetime, SVG, text } from "../media.mjs";
import { activeContentJourneys } from "./parts/active-content.mjs";
import { readUrlRenewalJourneys } from "./parts/read-url-renewal.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */

const BINARY = Buffer.from(Array.from({ length: 3 * 1024 * 1024 }, (_, index) => (index * 31 + (index >> 11)) % 256));

/**
 * A folder with one file in it, as the owner.
 *
 * @param {Ctx} ctx The journey
 * @param {{ name: string, mimetype: string, bytes: Buffer }} file The file
 * @returns {Promise<{ folderId: string, id: string, path: string }>} The folder, the file and its delivery path
 */
async function oneFile(ctx, file) {
  const folder = await createFolder(ctx, ctx.unique("Delivery"));
  const done = await uploaded(ctx, { folderId: folder.id, ...file });
  return { folderId: folder.id, id: done.id, path: deliveryPath(done.asset) };
}

/** `GET /media/<id>/<name>`: a stable link that redirects to a short-lived signed storage URL. */
export const journeys = guarded([
  {
    id: "public-file-redirects-to-the-same-bytes",
    title: "a public file's link redirects anyone to a signed URL with no-cache and an open CORS answer, and the storage serves every byte",
    entryPoint: "GET /media/<id>/<name> without a session",
    async run(/** @type {Ctx} */ ctx) {
      const file = await oneFile(ctx, { name: "Données été 東京.bin", mimetype: "application/pdf", bytes: BINARY });
      await setVisibility(ctx, "folders", file.folderId, "public");
      const anon = await follow(ctx, file.path, { headers: { origin: "https://site.example.org" } });
      recordRaw(ctx, anon.link, [
        check("302", anon.link.status === 302, anon.link.status),
        check("Cache-Control: no-cache", anon.link.headers["cache-control"] === "no-cache", anon.link.headers["cache-control"]),
        check("Access-Control-Allow-Origin: *", anon.link.headers["access-control-allow-origin"] === "*", anon.link.headers["access-control-allow-origin"]),
        check("the signed URL is not the shared link", !(anon.link.headers.location ?? "").includes("/media/"), anon.link.headers.location),
      ]);
      if (anon.file)
        recordRaw(ctx, anon.file, [
          check("200", anon.file.status === 200, anon.file.status),
          check("every byte, in order (3 MiB)", anon.file.bytes.byteLength === BINARY.byteLength && sha256(anon.file.bytes) === sha256(BINARY), anon.file.bytes.byteLength),
        ]);
      else ctx.record(anon.link.folder, [check("the link redirects to the file", false, anon.link.status)]);
      const allowed = await raw(ctx, "read the link from the dashboard's own origin", { path: file.path, headers: { origin: ctx.state.webUrl } });
      recordRaw(ctx, allowed, [
        check("an origin the API allows keeps its own CORS answer", allowed.headers["access-control-allow-origin"] === ctx.state.webUrl, allowed.headers["access-control-allow-origin"]),
        check("still no-cache", allowed.headers["cache-control"] === "no-cache", allowed.headers["cache-control"]),
      ]);
    },
  },
  {
    id: "private-file-needs-a-reader",
    title: "a private file's link answers a script 401, sends a browser to the file page, redirects a reader with no-store and refuses a member without read",
    entryPoint: "GET /media/<id>/<name> on a private file",
    async run(/** @type {Ctx} */ ctx) {
      const bytes = longText(4000);
      const file = await oneFile(ctx, { name: "notes privées.txt", mimetype: "text/plain", bytes });
      const script = await raw(ctx, "a script without a token", { path: file.path, headers: { accept: "application/json" } });
      recordRaw(ctx, script, [check("bare 401", script.status === 401 && !script.text.includes("<html"), `${script.status} ${script.text.slice(0, 80)}`)]);
      const browser = await raw(ctx, "a browser without a session", { path: file.path, headers: { accept: "text/html,application/xhtml+xml" } });
      recordRaw(ctx, browser, [
        check("302", browser.status === 302, browser.status),
        check("to the file page of the dashboard", browser.headers.location === `${ctx.state.webUrl}/modules/media/file?asset=${file.id}`, browser.headers.location),
        check("no-store", browser.headers["cache-control"] === "no-store", browser.headers["cache-control"]),
      ]);
      const owner = await follow(ctx, file.path, { as: "admin" });
      recordRaw(ctx, owner.link, [
        check("the owner is redirected", owner.link.status === 302, owner.link.status),
        check("no-store", owner.link.headers["cache-control"] === "no-store", owner.link.headers["cache-control"]),
        check("no open CORS answer", owner.link.headers["access-control-allow-origin"] !== "*", owner.link.headers["access-control-allow-origin"]),
      ]);
      if (owner.file) recordRaw(ctx, owner.file, [check("the same multi-chunk UTF-8 text", sha256(owner.file.bytes) === sha256(bytes), owner.file.bytes.byteLength)]);
      await member(ctx, "outsider", ["unrelated.page"]);
      const outsider = await raw(ctx, "a member without read on the folder", { path: file.path, as: "outsider" });
      recordRaw(ctx, outsider, [check("403", outsider.status === 403, outsider.status)]);
    },
  },
  {
    id: "a-reader-of-the-folder-opens-a-private-file",
    title: "a member whose role holds the permission a folder's ACL grants read opens its private file, and loses it when the ACL is another permission",
    entryPoint: "GET /media/<id>/<name> as a member",
    async run(/** @type {Ctx} */ ctx) {
      const readable = await declareFolder(ctx, { key: ctx.unique("verify.readers"), name: ctx.unique("Readers"), acl: [{ subject: { kind: "permission", id: "verify.readers" }, rights: ["read"] }] });
      const closed = await declareFolder(ctx, { key: ctx.unique("verify.closed"), name: ctx.unique("Closed"), acl: [{ subject: { kind: "permission", id: "verify.others" }, rights: ["read"] }] });
      const bytes = await image(ctx, { width: 20, height: 20 });
      const open = await uploaded(ctx, { folderId: text(readable.body, "result", "id"), name: "open.png", mimetype: "image/png", bytes });
      const shut = await uploaded(ctx, { folderId: text(closed.body, "result", "id"), name: "shut.png", mimetype: "image/png", bytes });
      await member(ctx, "reader", ["verify.readers"]);
      const read = await follow(ctx, deliveryPath(open.asset), { as: "reader" });
      recordRaw(ctx, read.link, [check("redirected", read.link.status === 302, read.link.status)]);
      if (read.file) recordRaw(ctx, read.file, [check("the bytes", sha256(read.file.bytes) === sha256(bytes), read.file.bytes.byteLength)]);
      const refused = await raw(ctx, "the same member on the other folder", { path: deliveryPath(shut.asset), as: "reader" });
      recordRaw(ctx, refused, [check("403", refused.status === 403, refused.status)]);
    },
  },
  {
    id: "a-stale-name-redirects-to-the-canonical-link",
    title: "a link with an old or wrong file name redirects to the current one; a rename keeps the id, and a missing name or an unknown asset is 404",
    entryPoint: "GET /media/<id>/<old name>",
    async run(/** @type {Ctx} */ ctx) {
      const file = await oneFile(ctx, { name: "avant.png", mimetype: "image/png", bytes: await image(ctx, { width: 8, height: 8 }) });
      await media(ctx, "rename the file", "POST", `/assets/${file.id}/update`, { body: { name: "après été.png" } });
      const old = await raw(ctx, "follow the link with the old name", { path: file.path, as: "admin" });
      recordRaw(ctx, old, [
        check("302", old.status === 302, old.status),
        check("to the canonical link", old.headers.location === `/media/${file.id}/${encodeURIComponent("après été.png")}`, old.headers.location),
        check("the redirect is not cached", old.headers["cache-control"] === "no-cache", old.headers["cache-control"]),
      ]);
      const current = await raw(ctx, "follow the canonical link", { path: `/media/${file.id}/${encodeURIComponent("après été.png")}`, as: "admin" });
      recordRaw(ctx, current, [check("redirects to the storage", current.status === 302 && (current.headers.location ?? "").includes("/file-storage/"), current.headers.location)]);
      const missing = await raw(ctx, "a link without a file name", { path: `/media/${file.id}/`, as: "admin" });
      const unknown = await raw(ctx, "a link to an unknown asset", { path: `/media/${ctx.unique("nope")}/x.png`, as: "admin" });
      recordRaw(ctx, missing, [check("404", missing.status === 404, missing.status)]);
      recordRaw(ctx, unknown, [check("404", unknown.status === 404, unknown.status)]);
    },
  },
  {
    id: "signed-urls-live-an-hour-or-five-minutes",
    title: "a public file's signed URL lives one hour and a private one five minutes, and the module hands out the same URL again within half that",
    entryPoint: "GET /media/<id>/<name> twice",
    async run(/** @type {Ctx} */ ctx) {
      const file = await oneFile(ctx, { name: "signed.png", mimetype: "image/png", bytes: await image(ctx, { width: 8, height: 8 }) });
      const first = await raw(ctx, "first private read", { path: file.path, as: "admin" });
      const second = await raw(ctx, "second private read", { path: file.path, as: "admin" });
      const privateLife = signedLifetime(ctx, first.headers.location ?? "");
      recordRaw(ctx, second, [
        check("the same signed URL twice", first.headers.location === second.headers.location && first.headers.location !== undefined, [first.headers.location, second.headers.location]),
        check("it lives five minutes", privateLife > 150 && privateLife <= 300, privateLife),
      ]);
      await setVisibility(ctx, "assets", file.id, "public");
      const open = await raw(ctx, "public read", { path: file.path });
      const publicLife = signedLifetime(ctx, open.headers.location ?? "");
      recordRaw(ctx, open, [
        check("another signed URL once public", open.headers.location !== first.headers.location, open.headers.location),
        check("it lives one hour", publicLife > 1800 && publicLife <= 3600, publicLife),
      ]);
    },
  },
  {
    id: "visibility-is-the-file-then-the-folder-then-private",
    title: "a file takes its own visibility, else its folder's, else private; a change shows on the next request and never changes the link",
    entryPoint: "POST /api/media/assets/:id/visibility, POST /api/media/folders/:id/visibility, GET /media/...",
    async run(/** @type {Ctx} */ ctx) {
      const file = await oneFile(ctx, { name: "vis.png", mimetype: "image/png", bytes: await image(ctx, { width: 8, height: 8 }) });
      /** @param {string} label @returns {Promise<number | null>} */
      const anonStatus = async (label) => (await raw(ctx, label, { path: file.path })).status;
      const steps = [["a new file in a new folder", 401]];
      const statuses = [await anonStatus("new file, new folder")];
      await setVisibility(ctx, "folders", file.folderId, "public");
      statuses.push(await anonStatus("folder public, file inherits"));
      steps.push(["folder public, file inherits", 302]);
      await setVisibility(ctx, "assets", file.id, "private");
      statuses.push(await anonStatus("folder public, file private"));
      steps.push(["file private wins over its folder", 401]);
      await setVisibility(ctx, "folders", file.folderId, "private");
      await setVisibility(ctx, "assets", file.id, "public");
      statuses.push(await anonStatus("folder private, file public"));
      steps.push(["file public wins over its folder", 302]);
      await setVisibility(ctx, "assets", file.id, "inherit");
      statuses.push(await anonStatus("back to inherit"));
      steps.push(["back to the folder's private", 401]);
      const details = await media(ctx, "read the file", "GET", `/assets/${file.id}`);
      await ctx.verify("each change shows on the next request", [
        ...steps.map(([label, wanted], index) => check(String(label), statuses[index] === wanted, statuses[index])),
        check("the link never changed", deliveryPath(pick(details.body, "asset")) === file.path, details.body),
      ]);
    },
  },
  {
    id: "the-dashboard-origin-serves-media-links",
    title: "a /media link on the dashboard's origin reaches the backend with the member's session, so a private file opens there",
    entryPoint: "GET <dashboard>/media/<id>/<name> with the session cookie",
    async run(/** @type {Ctx} */ ctx) {
      const bytes = await image(ctx, { width: 16, height: 16 });
      const file = await oneFile(ctx, { name: "dash.png", mimetype: "image/png", bytes });
      const cookie = await dashboardSession(ctx);
      const signedIn = await raw(ctx, "the dashboard origin with the session", { path: file.path, origin: "web", headers: { cookie, accept: "image/*" } });
      recordRaw(ctx, signedIn, [check("redirects to the signed URL", signedIn.status === 302 && (signedIn.headers.location ?? "").includes("token="), `${signedIn.status} ${signedIn.headers.location}`)]);
      const anon = await raw(ctx, "the dashboard origin without a session", { path: file.path, origin: "web", headers: { accept: "image/*" } });
      recordRaw(ctx, anon, [check("refused without the session", anon.status === 401, anon.status)]);
    },
  },
  ...activeContentJourneys(SVG),
  ...readUrlRenewalJourneys(),
]);
