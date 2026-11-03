import { readdirSync, rmSync } from "node:fs";
import { createFolder, deliveryPath, setVisibility, uploaded, withConfig } from "../../library.mjs";
import { check, longText, raw, recordRaw, sha256, storagePath } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/**
 * An SVG long enough to cross several network chunks, its description outside ASCII.
 *
 * @param {Buffer} svg A small drawing
 * @returns {Buffer} The drawing with a long `<desc>`
 */
function longSvg(svg) {
  return Buffer.concat([svg.subarray(0, svg.indexOf(">") + 1), Buffer.from("<desc>"), longText(3000), Buffer.from("</desc>"), svg.subarray(svg.indexOf(">") + 1)]);
}

/**
 * @param {Ctx} ctx The journey
 * @param {{ name: string, mimetype: string, bytes: Buffer }} file The file
 * @returns {Promise<{ folderId: string, id: string, path: string }>} Where it is
 */
async function oneFile(ctx, file) {
  const folder = await createFolder(ctx, ctx.unique("Active"));
  const done = await uploaded(ctx, { folderId: folder.id, ...file });
  return { folderId: folder.id, id: done.id, path: deliveryPath(done.asset) };
}

/**
 * Journeys of the files the API serves itself instead of redirecting: SVG inline, XML as an attachment.
 *
 * @param {Buffer} svg A drawing
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function activeContentJourneys(svg) {
  const drawing = longSvg(svg);
  return [
    {
      id: "svg-is-served-inline-by-the-api",
      title: "an SVG is not redirected: the API streams its bytes inline under a sandbox policy, nosniff, an ETag that answers 304, no byte ranges, and a cache policy that follows its visibility",
      entryPoint: "GET /media/<id>/<name>.svg",
      async run(/** @type {Ctx} */ ctx) {
        const file = await oneFile(ctx, { name: "logo étoilé.svg", mimetype: "image/svg+xml", bytes: drawing });
        const read = await raw(ctx, "read the private SVG", { path: file.path, as: "admin" });
        recordRaw(ctx, read, [
          check("200 from the API itself", read.status === 200, read.status),
          check("every byte, in order", sha256(read.bytes) === sha256(drawing), `${read.bytes.byteLength} of ${drawing.byteLength}`),
          check("image/svg+xml", (read.headers["content-type"] ?? "").startsWith("image/svg+xml"), read.headers["content-type"]),
          check("inline", (read.headers["content-disposition"] ?? "").startsWith("inline"), read.headers["content-disposition"]),
          check("Content-Security-Policy: sandbox", read.headers["content-security-policy"] === "sandbox", read.headers["content-security-policy"]),
          check("X-Content-Type-Options: nosniff", read.headers["x-content-type-options"] === "nosniff", read.headers["x-content-type-options"]),
          check("Cache-Control: private, no-cache", read.headers["cache-control"] === "private, no-cache", read.headers["cache-control"]),
          check("an ETag", (read.headers.etag ?? "").length > 2, read.headers.etag),
        ]);
        const again = await raw(ctx, "read again with If-None-Match", { path: file.path, as: "admin", headers: { "if-none-match": read.headers.etag ?? "" } });
        recordRaw(ctx, again, [check("304 and no body", again.status === 304 && again.bytes.byteLength === 0, again.status)]);
        const other = await raw(ctx, "read with another ETag", { path: file.path, as: "admin", headers: { "if-none-match": '"other"' } });
        recordRaw(ctx, other, [check("200 with the body", other.status === 200 && other.bytes.byteLength === drawing.byteLength, other.status)]);
        const range = await raw(ctx, "ask for a byte range", { path: file.path, as: "admin", headers: { range: "bytes=0-9" } });
        recordRaw(ctx, range, [check("the whole file, not 206", range.status === 200 && range.bytes.byteLength === drawing.byteLength, `${range.status} ${range.bytes.byteLength}`)]);
        await setVisibility(ctx, "assets", file.id, "public");
        const open = await raw(ctx, "read the public SVG without a session", { path: file.path, headers: { origin: "https://site.example.org" } });
        recordRaw(ctx, open, [
          check("200", open.status === 200, open.status),
          check("Cache-Control: public, no-cache", open.headers["cache-control"] === "public, no-cache", open.headers["cache-control"]),
          check("open to any origin", open.headers["access-control-allow-origin"] === "*", open.headers["access-control-allow-origin"]),
          check("still sandboxed", open.headers["content-security-policy"] === "sandbox", open.headers["content-security-policy"]),
        ]);
      },
    },
    {
      id: "xml-is-served-as-an-attachment",
      title: "an XML file, once the library accepts the type, is streamed by the API as an attachment under the same headers",
      entryPoint: "GET /media/<id>/<name>.xml",
      async run(/** @type {Ctx} */ ctx) {
        await withConfig(ctx, { VERIFY_MEDIA_MIMETYPES: "image/*,application/xml,text/xml" }, async () => {
          const bytes = Buffer.concat([Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<notes>\n'), longText(3000), Buffer.from("</notes>\n")]);
          const file = await oneFile(ctx, { name: "flux.xml", mimetype: "application/xml", bytes });
          const read = await raw(ctx, "read the XML file", { path: file.path, as: "admin" });
          recordRaw(ctx, read, [
            check("200 from the API", read.status === 200, read.status),
            check("attachment", (read.headers["content-disposition"] ?? "").startsWith("attachment"), read.headers["content-disposition"]),
            check("sandbox", read.headers["content-security-policy"] === "sandbox", read.headers["content-security-policy"]),
            check("nosniff", read.headers["x-content-type-options"] === "nosniff", read.headers["x-content-type-options"]),
            check("every byte, in order", sha256(read.bytes) === sha256(bytes), read.bytes.byteLength),
          ]);
        });
      },
    },
    {
      id: "an-unreadable-stored-file-answers-502",
      title: "an SVG whose stored bytes the storage cannot read answers 502",
      entryPoint: "GET /media/<id>/<name>.svg, stored file removed",
      async run(/** @type {Ctx} */ ctx) {
        const file = await oneFile(ctx, { name: "gone.svg", mimetype: "image/svg+xml", bytes: svg });
        const folder = storagePath(ctx, "files", "media", "default", file.folderId);
        const stored = readdirSync(folder);
        for (const name of stored) rmSync(storagePath(ctx, "files", "media", "default", file.folderId, name));
        const read = await raw(ctx, "read the SVG", { path: file.path, as: "admin" });
        recordRaw(ctx, read, [check("the stored file was removed", stored.length === 1, stored), check("502", read.status === 502, read.status)]);
      },
    },
  ];
}
