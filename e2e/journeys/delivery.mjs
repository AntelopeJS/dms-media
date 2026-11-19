import { guarded } from "../guard.mjs";
import { createFolder, dashboardSession, deliveryPath, uploaded } from "../library.mjs";
import { check, image, raw, recordRaw } from "../media.mjs";
import { readUrlRenewalJourneys } from "./parts/read-url-renewal.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */

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
  ...readUrlRenewalJourneys(),
]);
