import { guarded } from "../guard.mjs";
import { createFolder, setVisibility, uploaded, withConfig } from "../library.mjs";
import { check, image, list, media, parseJson, pick, text } from "../media.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */

/**
 * The origin the module builds copied links on, and one file's delivery links.
 *
 * @param {Ctx} ctx The journey
 * @param {string} assetId A file
 * @returns {Promise<{ origin: string, delivery: string, example: string }>} The origin, the delivery links and the presets' example link
 */
async function links(ctx, assetId) {
  const origin = text((await media(ctx, "links origin", "GET", "/links/origin")).body, "origin");
  const forged = await ctx.api("links origin with forwarded headers", { method: "GET", path: "/api/media/links/origin" });
  const delivery = JSON.stringify((await media(ctx, "delivery links", "GET", `/assets/${assetId}/delivery`)).body);
  const thumb = list((await media(ctx, "sizes", "GET", "/presets")).body, "presets").find((row) => pick(row, "id") === "thumb");
  return { origin: origin || text(forged.body, "origin"), delivery, example: text(thumb, "exampleUrl") };
}

/** The module's options that decide its links and what it accepts. */
export const journeys = guarded([
  {
    id: "links-start-with-the-public-url",
    title: "copied links, the Delivery tab and the sizes' example start with publicBaseUrl, else the DMS apiBaseUrl, never with a request header",
    entryPoint: "publicBaseUrl option, GET /api/media/links/origin, /assets/:id/delivery, /presets",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Links"));
      const photo = await uploaded(ctx, { folderId: folder.id, name: "lien.png", mimetype: "image/png", bytes: await image(ctx, { width: 20, height: 20 }) });
      await setVisibility(ctx, "assets", photo.id, "public");
      const fallback = await links(ctx, photo.id);
      const forwarded = await fetch(`${ctx.state.apiUrl}/api/media/links/origin`, { headers: { authorization: `Bearer ${ctx.state.tokens?.admin ?? ""}`, "x-forwarded-host": "evil.example.org", "x-forwarded-proto": "https", host: "evil.example.org" } }).then(async (response) => parseJson(await response.text())).catch(() => ({}));
      /** @type {{ origin: string, delivery: string, example: string }[]} */
      const seen = [];
      await withConfig(ctx, { VERIFY_MEDIA_PUBLIC_BASE_URL: "https://cdn.example.org" }, async () => {
        seen.push(await links(ctx, photo.id));
      });
      const [configured] = seen;
      await ctx.verify("the origin of every copied link", [
        check("without publicBaseUrl, the DMS apiBaseUrl", fallback.origin === ctx.state.webUrl && fallback.delivery.includes(`${ctx.state.webUrl}/media/${photo.id}/`) && fallback.example.startsWith(`${ctx.state.webUrl}/media/`), fallback),
        check("request headers never change it", pick(forwarded, "origin") === ctx.state.webUrl, forwarded),
        check("with publicBaseUrl, it", configured?.origin === "https://cdn.example.org" && configured.delivery.includes(`https://cdn.example.org/media/${photo.id}/`) && configured.example.startsWith("https://cdn.example.org/media/"), configured),
      ]);
    },
  },
]);
