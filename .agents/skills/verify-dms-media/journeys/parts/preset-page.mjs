import { createFolder, follow, uploaded } from "../../library.mjs";
import { check, image } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/**
 * Whether an image of the page has loaded real pixels.
 *
 * @param {import("../../media.mjs").Tab} tab The tab
 * @param {string} alt The image's alternative text
 * @returns {Promise<{ loaded: boolean, src: string }>} Whether it loaded, and from where
 */
async function loadedImage(tab, alt) {
  const target = tab.page.getByRole("img", { name: alt }).first();
  await target.waitFor({ timeout: 20_000 }).catch(() => undefined);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await target.evaluate((element) => ({ loaded: element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0, src: element.getAttribute("src") ?? "" })).catch(() => ({ loaded: false, src: "" }));
    if (state.loaded) return state;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { loaded: false, src: "" };
}

/**
 * Journeys of the Image sizes page.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function presetPageJourneys() {
  return [
    {
      id: "image-sizes-page-shows-each-size",
      title: "Settings › Image sizes shows a card per size with its size, format, an example link on the public origin, a preview loaded through the dashboard even for a private image, the cached count, the Cache card and the configuration block",
      entryPoint: "/modules/media/presets",
      async run(/** @type {Ctx} */ ctx) {
        const folder = await createFolder(ctx, ctx.unique("Page sizes"));
        const photo = await uploaded(ctx, { folderId: folder.id, name: "carte.png", mimetype: "image/png", bytes: await image(ctx, { width: 600, height: 400 }) });
        const tab = await ctx.tab();
        await tab.signIn("admin");
        await tab.goto("/modules/media/presets");
        const thumbPreview = await loadedImage(tab, "carte.png rendered at the thumb size");
        await ctx.verify("a card per size", [
          tab.visible({ role: "heading", name: "thumb", level: 3 }, { timeoutMs: 30_000 }),
          tab.visible({ role: "heading", name: "preview", level: 3 }),
          tab.shows(/300×300/),
          tab.shows(/1600×–/),
          tab.shows(/WEBP/),
          tab.visible({ role: "link", name: `${ctx.state.webUrl}/media/${photo.id}/thumb/carte.png` }),
          check("the private example's preview loads through the dashboard's origin", thumbPreview.loaded && thumbPreview.src.startsWith("/media/"), thumbPreview),
        ]);
        await ctx.verify("the Cache card", [tab.shows(/Public files\s*1 h/), tab.shows(/Private files\s*5 min/), tab.shows(/Nightly clean-up of old sizes/)]);
        await ctx.verify("the Configuration card", [tab.shows(/antelope\.config\.ts/), tab.shows(/"presets": \[/), tab.visible({ role: "button", name: "Copy" })]);
        await follow(ctx, `/media/${photo.id}/thumb/carte.png`, { as: "admin" });
        await tab.reload();
        await ctx.verify("the rendering is counted", [tab.shows(/1 rendering cached|1 rendered/i, { timeoutMs: 20_000 })]);
      },
    },
  ];
}
