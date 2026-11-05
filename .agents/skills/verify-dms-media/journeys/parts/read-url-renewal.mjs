import { createFolder, deliveryPath, uploaded } from "../../library.mjs";
import { check, image, raw, sha256, signedLifetime } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/** A private file's signed URL lives 300 s and is handed out again for half of that. */
const RENEWAL_AFTER_MS = 151_000;

/**
 * Opens a signed storage URL the way a browser follows a redirect.
 *
 * @param {Ctx} ctx The journey
 * @param {string} label What the request does
 * @param {string} location The `Location` the link answered
 * @returns {Promise<{ status: number | null, sha: string }>} The status and the SHA-256 of the bytes
 */
async function opened(ctx, label, location) {
  if (location === "") return { status: null, sha: "" };
  const answer = await raw(ctx, label, { url: new URL(location, ctx.state.apiUrl).href });
  return { status: answer.status, sha: sha256(answer.bytes) };
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aPrivateLinksSignedUrlIsRenewedAfterHalfItsLife = {
  id: "a-private-links-signed-url-is-renewed-after-half-its-life",
  title: "a private file's link gives the same signed URL for 150 s of its 300 s and a different one at 151 s, each living the lifetime it was given, and both open the same bytes while they are valid",
  entryPoint: "GET /media/:id/:name at 0 s, 1 s and 151 s",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Renewal"));
    const bytes = await image(ctx, { width: 16, height: 16 });
    const file = await uploaded(ctx, { folderId: folder.id, name: "renewal.png", mimetype: "image/png", bytes });
    const path = deliveryPath(file.asset);
    const first = await raw(ctx, "read at 0 s", { path, as: "admin" });
    const readAt = Date.now();
    const early = await raw(ctx, "read a moment later", { path, as: "admin" });
    const firstUrl = first.headers.location ?? "";
    const firstOpen = await opened(ctx, "open the URL given at 0 s", firstUrl);
    await ctx.verify("within half its life the URL is the same", [
      check("both reads redirect", first.status === 302 && early.status === 302, [first.status, early.status]),
      check("the same signed URL", firstUrl !== "" && early.headers.location === firstUrl, [firstUrl, early.headers.location]),
      check("it lives five minutes", signedLifetime(ctx, firstUrl) > 290 && signedLifetime(ctx, firstUrl) <= 300, signedLifetime(ctx, firstUrl)),
      check("it opens the uploaded bytes", firstOpen.status === 200 && firstOpen.sha === sha256(bytes), firstOpen),
    ]);
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, RENEWAL_AFTER_MS - (Date.now() - readAt))));
    const late = await raw(ctx, "read at 151 s", { path, as: "admin" });
    const lateUrl = late.headers.location ?? "";
    const lateLife = signedLifetime(ctx, lateUrl);
    const firstLife = signedLifetime(ctx, firstUrl);
    const lateOpen = await opened(ctx, "open the URL given at 151 s", lateUrl);
    const firstAgain = await opened(ctx, "open the URL given at 0 s again", firstUrl);
    await ctx.verify("after half its life a new URL is given", [
      check("the link still redirects", late.status === 302, late.status),
      check("a different signed URL", lateUrl !== "" && lateUrl !== firstUrl, [firstUrl, lateUrl]),
      check("the new URL lives a full five minutes, not what was left of the first", lateLife > 290 && lateLife <= 300, lateLife),
      check("the first URL is still valid, with under half its life left", firstLife > 0 && firstLife <= 150, firstLife),
      check("the new URL opens the same bytes", lateOpen.status === 200 && lateOpen.sha === sha256(bytes), lateOpen),
      check("the first URL still opens the same bytes", firstAgain.status === 200 && firstAgain.sha === sha256(bytes), firstAgain),
    ]);
  },
};

/**
 * Journeys of how long the signed URLs of the delivery links are reused.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function readUrlRenewalJourneys() {
  return [aPrivateLinksSignedUrlIsRenewedAfterHalfItsLife];
}
