import { createFolder, upload, uploaded, withConfig } from "../../library.mjs";
import { check, image, media, pick, raw, text } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/**
 * Checks that an answer is the documented refusal body.
 *
 * @param {import("../../media.mjs").Answer} answer The refusal
 * @param {number} status Its status
 * @param {string} reason Its reason
 * @returns {import("../../media.mjs").Check[]} The checks
 */
function refused(answer, status, reason) {
  return [
    check(`HTTP ${status}`, answer.status === status, answer.status),
    check(`reason ${reason}`, pick(answer.body, "reason") === reason, answer.body),
    check("a message", text(answer.body, "message").length > 0, answer.body),
  ];
}

/**
 * Journeys of the types the library refuses and accepts.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function refusalJourneys() {
  return [
    {
      id: "active-documents-are-refused-by-type-or-extension",
      title: "HTML, XHTML and PHP are refused 415 type_not_allowed at presign and at confirm, by every type and every extension the module lists, case aside, and a type outside allowedMimetypes too; a default type is accepted",
      entryPoint: "POST /api/media/upload/presign",
      async run(/** @type {Ctx} */ ctx) {
        const folder = await createFolder(ctx, ctx.unique("Refusals"));
        const typed = [
          ["page.txt", "text/html"],
          ["page.txt", "application/xhtml+xml"],
          ["run.txt", "application/x-httpd-php"],
          ["run.txt", "application/x-httpd-php-source"],
          ["run.txt", "application/x-php"],
          ["run.txt", "text/x-php"],
          ["page.txt", "TEXT/HTML; charset=utf-8"],
        ];
        const extensions = ["htm", "html", "xhtml", "xht", "shtml", "mht", "mhtml", "php", "php3", "php4", "php5", "php7", "php8", "phps", "pht", "phtml", "phar", "HTM", "Php"];
        const cases = [...typed, ...extensions.map((extension) => [`looks-plain.${extension}`, "text/plain"]), ["tool.exe", "application/x-msdownload"]];
        const checks = [];
        for (const [name, mimetype] of cases) {
          const done = await upload(ctx, { folderId: folder.id, name: String(name), mimetype: String(mimetype), bytes: Buffer.from("<p>x</p>") });
          checks.push(check(`${name} as ${mimetype}: 415 type_not_allowed with a message`, done.presign.status === 415 && pick(done.presign.body, "reason") === "type_not_allowed" && text(done.presign.body, "message") !== "", done.presign.body));
        }
        await ctx.verify("every active document and unlisted type is refused at presign", checks);
        const presigned = await media(ctx, "presign a plain text file", "POST", "/upload/presign", { body: { folderId: folder.id, filename: "ok.txt", size: 8, mimetype: "text/plain" } });
        await raw(ctx, "PUT it", { url: text(presigned.body, "uploadUrl"), method: "PUT", headers: { "content-type": "text/plain" }, body: Buffer.from("<p>x</p>") });
        const renamed = await media(ctx, "confirm it under an .htm name", "POST", "/upload/confirm", { body: { folderId: folder.id, resourceKey: text(presigned.body, "resourceKey"), filename: "page.htm" } });
        await ctx.verify("confirm refuses by extension too", refused(renamed, 415, "type_not_allowed"));
        const accepted = await upload(ctx, { folderId: folder.id, name: "notes.md", mimetype: "text/markdown", bytes: Buffer.from("# Notes\n") });
        await ctx.verify("a default type is accepted", [check("markdown is uploaded", accepted.confirm?.status === 200, accepted.confirm?.body)]);
      },
    },
    {
      id: "allowed-mimetypes-match-a-prefix-and-confirm-checks-again",
      title: "by default video, audio, PDF, Office, OpenDocument, RTF, plain text, Markdown and CSV are accepted and other types refused; allowedMimetypes with image/* accepts any image and refuses a PDF, and confirm refuses a file whose type the library stopped accepting after presign",
      entryPoint: "allowedMimetypes, POST /api/media/upload/confirm",
      async run(/** @type {Ctx} */ ctx) {
        const folder = await createFolder(ctx, ctx.unique("Types"));
        const pdfBytes = Buffer.from("%PDF-1.4\n%%EOF\n");
        const pdf = await media(ctx, "presign a PDF", "POST", "/upload/presign", { body: { folderId: folder.id, filename: "late.pdf", size: pdfBytes.byteLength, mimetype: "application/pdf" } });
        await raw(ctx, "PUT the PDF", { url: text(pdf.body, "uploadUrl"), method: "PUT", headers: { "content-type": "application/pdf" }, body: pdfBytes });
        const defaults = ["video/mp4", "video/webm", "audio/mpeg", "application/pdf", "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.spreadsheet", "application/vnd.oasis.opendocument.presentation", "audio/wav", "video/quicktime", "application/rtf", "text/plain", "text/markdown", "text/csv"];
        const defaultChecks = [];
        for (const [index, mimetype] of defaults.entries()) {
          const done = await upload(ctx, { folderId: folder.id, name: `default-${index}.bin`, mimetype, bytes: Buffer.from(`file ${index}`) });
          defaultChecks.push(check(`${mimetype} is accepted by default`, done.confirm?.status === 200, done.confirm?.body ?? done.presign.body));
        }
        for (const mimetype of ["application/zip", "application/json", "application/octet-stream"]) {
          const done = await upload(ctx, { folderId: folder.id, name: "other.bin", mimetype, bytes: Buffer.from("x") });
          defaultChecks.push(check(`${mimetype} is not in the defaults: 415`, done.presign.status === 415, done.presign.body));
        }
        await ctx.verify("the default allowedMimetypes", defaultChecks);
        await withConfig(ctx, { VERIFY_MEDIA_MIMETYPES: "image/*" }, async () => {
          const webp = await uploaded(ctx, { folderId: folder.id, name: "a.webp", mimetype: "image/webp", bytes: await image(ctx, { width: 4, height: 4, format: "webp" }) });
          const refusedPdf = await upload(ctx, { folderId: folder.id, name: "b.pdf", mimetype: "application/pdf", bytes: Buffer.from("%PDF-1.4\n") });
          await ctx.verify("image/* is a prefix", [check("webp accepted", webp.id !== "", webp.id), ...refused(refusedPdf.presign, 415, "type_not_allowed")]);
          const confirm = await media(ctx, "confirm the PDF presigned before the change", "POST", "/upload/confirm", {
            body: { folderId: folder.id, resourceKey: text(pdf.body, "resourceKey"), filename: "late.pdf" },
          });
          await ctx.verify("confirm runs the type check too", refused(confirm, 415, "type_not_allowed"));
        });
      },
    },
  ];
}
