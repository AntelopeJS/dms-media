import { createFolder, dashboardSession, uploaded } from "../../library.mjs";
import { check, image, media, raw, recordRaw } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/**
 * Journeys of what the frontend server renders before any script runs.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function renderedJourneys() {
  return [
    {
      id: "pages-arrive-rendered-by-the-server",
      title: "the Overview, the Library's folder tree and listing, a link to a folder, a view or a search, and a file's page arrive from the server with their data",
      entryPoint: "GET <dashboard>/modules/media/* with the session cookie, no script",
      async run(/** @type {Ctx} */ ctx) {
        const folderName = ctx.unique("Rendu");
        const folder = await createFolder(ctx, folderName);
        const file = await uploaded(ctx, { folderId: folder.id, name: "rendu-serveur.png", mimetype: "image/png", bytes: await image(ctx, { width: 10, height: 10 }) });
        await media(ctx, "star it", "POST", "/favorites", { body: { kind: "asset", targetId: file.id, starred: true } });
        const cookie = await dashboardSession(ctx);
        const pages = [
          ["/modules/media/overview", "rendu-serveur.png"],
          ["/modules/media/files", folderName],
          [`/modules/media/files?folder=${folder.id}`, "rendu-serveur.png"],
          ["/modules/media/files?view=starred", "rendu-serveur.png"],
          ["/modules/media/files?q=serveur", "rendu-serveur.png"],
          [`/modules/media/file?asset=${file.id}`, "rendu-serveur.png"],
        ];
        for (const [path, expected] of pages) {
          const answer = await raw(ctx, `read ${path} as the server sends it`, { path: String(path), origin: "web", headers: { cookie, accept: "text/html" } });
          recordRaw(ctx, answer, [check(`${path} holds ${expected}`, answer.status === 200 && answer.text.includes(String(expected)), `${answer.status} ${answer.text.length} bytes`)]);
        }
      },
    },
  ];
}
