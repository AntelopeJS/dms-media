import {
  createFolder,
  deliveryPath,
  uploaded,
  withConfig,
} from "../../library.mjs";
import { check, image, raw, sha256, signedLifetime } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/** The private-link lifetime the journey runs the backend with, so half of it passes in seconds. */
const LIFETIME_S = 20;
const HALF_LIFE_S = LIFETIME_S / 2;
const RENEWAL_AFTER_MS = (HALF_LIFE_S + 1) * 1000;
/** Seconds a lifetime may have run down between the token's creation and its reading. */
const READ_SLACK_S = 2;

/**
 * @param {number} life Seconds a signed URL has left
 * @returns {boolean} Whether it is a lifetime just given
 */
function freshLife(life) {
  return life > LIFETIME_S - READ_SLACK_S && life <= LIFETIME_S;
}

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
  const answer = await raw(ctx, label, {
    url: new URL(location, ctx.state.apiUrl).href,
  });
  return { status: answer.status, sha: sha256(answer.bytes) };
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aPrivateLinksSignedUrlIsRenewedAfterHalfItsLife = {
  id: "a-private-links-signed-url-is-renewed-after-half-its-life",
  title:
    "with a 20 s private-link lifetime, a private file's link gives the same signed URL for 10 s and a different one at 11 s, each living the lifetime it was given, and both open the same bytes while they are valid",
  entryPoint: "GET /media/:id/:name at 0 s, at once and at 11 s",
  async run(/** @type {Ctx} */ ctx) {
    await withConfig(
      ctx,
      { VERIFY_MEDIA_PRIVATE_LINK_SECONDS: String(LIFETIME_S) },
      () => renewal(ctx),
    );
  },
};

/**
 * Reads a private file's link before and after half its URL's lifetime.
 *
 * @param {Ctx} ctx The journey
 * @returns {Promise<void>}
 */
async function renewal(ctx) {
  const folder = await createFolder(ctx, ctx.unique("Renewal"));
  const bytes = await image(ctx, { width: 16, height: 16 });
  const file = await uploaded(ctx, {
    folderId: folder.id,
    name: "renewal.png",
    mimetype: "image/png",
    bytes,
  });
  const path = deliveryPath(file.asset);
  const first = await raw(ctx, "read at 0 s", { path, as: "admin" });
  const readAt = Date.now();
  const early = await raw(ctx, "read a moment later", { path, as: "admin" });
  const firstUrl = first.headers.location ?? "";
  const firstOpen = await opened(ctx, "open the URL given at 0 s", firstUrl);
  await ctx.verify("within half its life the URL is the same", [
    check("both reads redirect", first.status === 302 && early.status === 302, [
      first.status,
      early.status,
    ]),
    check(
      "the same signed URL",
      firstUrl !== "" && early.headers.location === firstUrl,
      [firstUrl, early.headers.location],
    ),
    check(
      "it lives the configured lifetime",
      freshLife(signedLifetime(ctx, firstUrl)),
      signedLifetime(ctx, firstUrl),
    ),
    check(
      "it opens the uploaded bytes",
      firstOpen.status === 200 && firstOpen.sha === sha256(bytes),
      firstOpen,
    ),
  ]);
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, RENEWAL_AFTER_MS - (Date.now() - readAt))),
  );
  const late = await raw(ctx, "read at 11 s", { path, as: "admin" });
  const lateUrl = late.headers.location ?? "";
  const lateLife = signedLifetime(ctx, lateUrl);
  const firstLife = signedLifetime(ctx, firstUrl);
  const lateOpen = await opened(ctx, "open the URL given at 11 s", lateUrl);
  const firstAgain = await opened(
    ctx,
    "open the URL given at 0 s again",
    firstUrl,
  );
  await ctx.verify("after half its life a new URL is given", [
    check("the link still redirects", late.status === 302, late.status),
    check("a different signed URL", lateUrl !== "" && lateUrl !== firstUrl, [
      firstUrl,
      lateUrl,
    ]),
    check(
      "the new URL lives a full lifetime, not what was left of the first",
      freshLife(lateLife),
      lateLife,
    ),
    check(
      "the first URL is still valid, with under half its life left",
      firstLife > 0 && firstLife <= HALF_LIFE_S,
      firstLife,
    ),
    check(
      "the new URL opens the same bytes",
      lateOpen.status === 200 && lateOpen.sha === sha256(bytes),
      lateOpen,
    ),
    check(
      "the first URL still opens the same bytes",
      firstAgain.status === 200 && firstAgain.sha === sha256(bytes),
      firstAgain,
    ),
  ]);
}

/**
 * Journeys of how long the signed URLs of the delivery links are reused.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function readUrlRenewalJourneys() {
  return [aPrivateLinksSignedUrlIsRenewedAfterHalfItsLife];
}
