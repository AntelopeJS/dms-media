import { waitForHydration } from "../../chooser.mjs";
import { uploaded } from "../../library.mjs";
import { check, image, media, pick } from "../../media.mjs";
import { boundFolder } from "../folders.mjs";
import { openPicker } from "./picker-uploads.mjs";

/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {import("../../media.mjs").Tab} Tab
 */

const PICKER = { role: "dialog", name: "Choose from the library" };

/**
 * The entries a multiple field lists, by their labels: the file's name, its position and, for the first, Cover.
 *
 * @param {Tab} tab The tab on the field page
 * @returns {Promise<string[]>} One label per entry
 */
function entryLabels(tab) {
  return tab.page.evaluate(() =>
    [...document.querySelectorAll("li[data-index][aria-label]")].map(
      (entry) => entry.getAttribute("aria-label") ?? "",
    ),
  );
}

/**
 * Clicks Save once, then reads the form's stored values until `done` holds or 15 s pass.
 *
 * @param {Ctx} ctx The journey
 * @param {Tab} tab The tab on the field page
 * @param {(values: unknown) => boolean} done Whether the stored values are the ones the form should have sent
 * @returns {Promise<unknown>} The last stored values
 */
async function saveUntil(ctx, tab, done) {
  await tab.click({ role: "button", name: /^Save/, nth: 0 });
  let saved = await ctx.api("read the saved values", {
    method: "GET",
    path: "/api/e2e-media/fields/values",
  });
  for (let attempt = 0; attempt < 30 && !done(saved.body); attempt += 1) {
    await tab.page.waitForTimeout(500);
    saved = await ctx.api("read the saved values again", {
      method: "GET",
      path: "/api/e2e-media/fields/values",
    });
  }
  return saved.body;
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aFieldAddsOrdersDescribesAndRemovesImages = {
  id: "a-field-adds-orders-describes-and-removes-images",
  title:
    "in a form, an image field adds the images picked in its picker, warns of the missing alt text and saves one from the field, makes an image the cover, removes one, adds another and stores the ids in that order; a single image field replaces and removes its image",
  entryPoint: "/e2e-fields, Projects and Cover fields",
  async run(/** @type {Ctx} */ ctx) {
    const projects = await boundFolder(ctx, "verify.projects");
    const covers = await boundFolder(ctx, "verify.cover");
    const bytes = () => image(ctx, { width: 9, height: 9 });
    const one = await uploaded(ctx, {
      folderId: projects,
      name: "un.png",
      mimetype: "image/png",
      bytes: await bytes(),
    });
    const two = await uploaded(ctx, {
      folderId: projects,
      name: "deux.png",
      mimetype: "image/png",
      bytes: await bytes(),
    });
    const three = await uploaded(ctx, {
      folderId: projects,
      name: "trois.png",
      mimetype: "image/png",
      bytes: await bytes(),
    });
    const sky = await uploaded(ctx, {
      folderId: covers,
      name: "ciel.png",
      mimetype: "image/png",
      bytes: await bytes(),
    });
    const sea = await uploaded(ctx, {
      folderId: covers,
      name: "mer.png",
      mimetype: "image/png",
      bytes: await bytes(),
    });
    const tab = await ctx.tab();
    await tab.signIn("admin");
    await tab.goto("/e2e-fields");
    await tab.visible(
      { role: "button", name: "Projects", exact: true },
      { timeoutMs: 30_000 },
    );
    await waitForHydration(tab, 60_000);
    const opened = await openPicker(tab, "Projects");
    await ctx.verify("the picker opens on the field's folder", [
      check("the dialog", opened, opened),
      tab.shows(/Accepts: Images/),
      tab.visible(
        { role: "option", name: /^un\.png/, within: PICKER },
        { timeoutMs: 20_000 },
      ),
    ]);
    await tab.click({ role: "option", name: /^un\.png/, within: PICKER });
    await tab.click({ role: "option", name: /^deux\.png/, within: PICKER });
    await ctx.verify("the confirm button counts the choice", [
      tab.visible({ role: "button", name: /^Add 2 images/, within: PICKER }),
    ]);
    await tab.click({ role: "button", name: /^Add 2 images/, within: PICKER });
    await ctx.verify("the field lists both images, the first as the cover", [
      tab.visible(PICKER, { hidden: true }),
      tab.visible(
        { role: "button", name: "Actions for un.png", exact: true },
        { timeoutMs: 15_000 },
      ),
      tab.visible({
        role: "button",
        name: "Actions for deux.png",
        exact: true,
      }),
      tab.shows(/2 images have no alt text\./),
      check(
        "un.png is first, the cover",
        (await entryLabels(tab)).join("|") ===
          "un.png, 1 of 2 · Cover|deux.png, 2 of 2",
        await entryLabels(tab),
      ),
    ]);
    await tab.click({
      role: "button",
      name: "Add alt text to un.png",
      exact: true,
    });
    await tab.fill({ role: "textbox", name: /Alt text/ }, "Un chantier");
    await tab.press("Control+Enter");
    await ctx.verify("the button now edits the alt text", [
      tab.visible(
        { role: "button", name: "Edit the alt text of un.png", exact: true },
        { timeoutMs: 15_000 },
      ),
      tab.shows(/1 image has no alt text\./),
    ]);
    let described = await media(ctx, "read un.png", "GET", `/assets/${one.id}`);
    for (
      let attempt = 0;
      attempt < 20 && pick(described.body, "asset", "alt") !== "Un chantier";
      attempt += 1
    ) {
      await tab.page.waitForTimeout(250);
      described = await media(
        ctx,
        "read un.png again",
        "GET",
        `/assets/${one.id}`,
      );
    }
    await ctx.verify("the alt text is the file's own", [
      check(
        "the asset holds it",
        pick(described.body, "asset", "alt") === "Un chantier",
        described.body,
      ),
    ]);
    await tab.click({
      role: "button",
      name: "Actions for deux.png",
      exact: true,
    });
    await ctx.verify("the menu of the second image", [
      tab.visible({ role: "menuitem", name: "Make cover", exact: true }),
      tab.visible({ role: "menuitem", name: "Move earlier", exact: true }),
      tab.visible(
        { role: "menuitem", name: "Move later", exact: true },
        { hidden: true },
      ),
      tab.visible({ role: "menuitem", name: "Remove", exact: true }),
    ]);
    await tab.click({ role: "menuitem", name: "Make cover", exact: true });
    await ctx.verify("deux.png is the cover", [
      tab.shows(/deux\.png moved to position 1 of 2/, { timeoutMs: 15_000 }),
      check(
        "deux.png is first, the cover",
        (await entryLabels(tab)).join("|") ===
          "deux.png, 1 of 2 · Cover|un.png, 2 of 2",
        await entryLabels(tab),
      ),
    ]);
    await tab.click({
      role: "button",
      name: "Actions for un.png",
      exact: true,
    });
    await tab.click({ role: "menuitem", name: "Remove", exact: true });
    await ctx.verify("one image is left", [
      tab.visible(
        { role: "button", name: "Actions for un.png", exact: true },
        { hidden: true, timeoutMs: 15_000 },
      ),
      check(
        "only deux.png",
        (await entryLabels(tab)).join("|") === "deux.png, 1 of 1 · Cover",
        await entryLabels(tab),
      ),
    ]);
    await tab.click({ role: "button", name: "Projects", exact: true });
    await tab.click({ role: "option", name: /^trois\.png/, within: PICKER });
    await tab.click({ role: "button", name: /^Add image\b/, within: PICKER });
    await ctx.verify("the third image joins", [
      tab.visible(
        { role: "button", name: "Actions for trois.png", exact: true },
        { timeoutMs: 15_000 },
      ),
      check(
        "deux.png then trois.png",
        (await entryLabels(tab)).join("|") ===
          "deux.png, 1 of 2 · Cover|trois.png, 2 of 2",
        await entryLabels(tab),
      ),
    ]);
    const saved = await saveUntil(
      ctx,
      tab,
      (values) =>
        JSON.stringify(pick(values, "projects")) ===
        JSON.stringify([two.id, three.id]),
    );
    await ctx.verify("the form stored the ids in that order, never URLs", [
      check(
        "projects holds deux then trois",
        JSON.stringify(pick(saved, "projects")) ===
          JSON.stringify([two.id, three.id]),
        saved,
      ),
    ]);
    await tab.click({ role: "button", name: "Cover", exact: true });
    await tab.click({ role: "option", name: /^ciel\.png/, within: PICKER });
    await tab.click({
      role: "button",
      name: /^Choose image\b/,
      within: PICKER,
    });
    await ctx.verify("the single field holds the image", [
      tab.visible(
        { role: "button", name: "Replace ciel.png", exact: true },
        { timeoutMs: 15_000 },
      ),
      tab.visible({ role: "button", name: "Remove ciel.png", exact: true }),
    ]);
    await tab.click({ role: "button", name: "Replace ciel.png", exact: true });
    await tab.click({ role: "option", name: /^mer\.png/, within: PICKER });
    await tab.click({
      role: "button",
      name: /^Choose image\b/,
      within: PICKER,
    });
    await ctx.verify("the replacement shows", [
      tab.visible(
        { role: "button", name: "Replace mer.png", exact: true },
        { timeoutMs: 15_000 },
      ),
      tab.visible(
        { role: "button", name: "Replace ciel.png", exact: true },
        { hidden: true },
      ),
    ]);
    const replaced = await saveUntil(
      ctx,
      tab,
      (values) => pick(values, "cover") === sea.id,
    );
    await ctx.verify("the form stored the replacement's id", [
      check(
        "cover holds mer.png's id",
        pick(replaced, "cover") === sea.id,
        replaced,
      ),
      check("not ciel.png's", pick(replaced, "cover") !== sky.id, replaced),
    ]);
    await tab.click({ role: "button", name: "Remove mer.png", exact: true });
    await ctx.verify("the field is empty again", [
      tab.visible(
        { role: "button", name: "Remove mer.png", exact: true },
        { hidden: true, timeoutMs: 15_000 },
      ),
      tab.visible({ role: "button", name: "Cover", exact: true }),
    ]);
    const emptied = await saveUntil(
      ctx,
      tab,
      (values) => pick(values, "cover") !== sea.id,
    );
    await ctx.verify("the removal is stored", [
      check(
        "cover holds no id",
        pick(emptied, "cover") === null || pick(emptied, "cover") === "",
        emptied,
      ),
      check(
        "projects is unchanged",
        JSON.stringify(pick(emptied, "projects")) ===
          JSON.stringify([two.id, three.id]),
        emptied,
      ),
    ]);
  },
};

/**
 * Journeys of the entries an asset field lists.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function fieldEntryJourneys() {
  return [aFieldAddsOrdersDescribesAndRemovesImages];
}
