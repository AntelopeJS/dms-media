import { guarded } from "../guard.mjs";
import { createFolder, setVisibility, tree, uploaded, withConfig } from "../library.mjs";
import { check, image, list, media, pick, text } from "../media.mjs";
import { activityJourneys } from "./parts/activity.mjs";
import { overviewFigureJourneys } from "./parts/overview-figures.mjs";
import { renderedJourneys } from "./parts/rendered.mjs";
import { chooseFiles } from "./parts/upload-page.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */

/**
 * @param {unknown} body A statistics answer
 * @param {string} id An item
 * @returns {unknown} Its value
 */
function itemValue(body, id) {
  return pick(list(body, "items").find((row) => pick(row, "id") === id), "value");
}

/** The Overview: what needs attention, the figures, storage by type, activity, recent files, the drop zone. */
export const journeys = guarded([
  {
    id: "the-overview-reads-the-library",
    title: "Needs attention counts images without alt and the public ones, failed uploads of the last 24 hours and files over 20 MB; the KPIs count files, files added in 30 days, storage, public files and missing alt; storage by type counts edited originals; activity and recently added list the newest",
    entryPoint: "/modules/media/overview, GET /api/media/stats/*",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Stats"));
      const a = await uploaded(ctx, { folderId: folder.id, name: "a.png", mimetype: "image/png", bytes: await image(ctx, { width: 40, height: 40 }) });
      await uploaded(ctx, { folderId: folder.id, name: "b.png", mimetype: "image/png", bytes: await image(ctx, { width: 40, height: 40 }) });
      const described = await uploaded(ctx, { folderId: folder.id, name: "c.png", mimetype: "image/png", bytes: await image(ctx, { width: 40, height: 40 }) });
      await media(ctx, "describe c", "POST", `/assets/${described.id}/update`, { body: { alt: "C" } });
      await setVisibility(ctx, "assets", a.id, "public");
      const huge = await uploaded(ctx, { folderId: folder.id, name: "lourd.pdf", mimetype: "application/pdf", bytes: Buffer.alloc(21 * 1000 * 1000, 37) });
      await media(ctx, "report a batch with a failure", "POST", "/upload/batches", { body: { batchId: ctx.unique("b"), folderId: folder.id, total: 2, uploaded: 1, failed: 1, size: 3, failures: [{ name: "x.html", reason: "type_not_allowed" }] } });
      const storageBefore = Number(pick((await media(ctx, "storage before an edit", "GET", "/stats/storage")).body, "value"));
      await media(ctx, "rotate b", "POST", `/assets/${described.id}/transform`, { body: { rotate: 90 } });
      const kpis = await media(ctx, "KPIs", "GET", "/stats/kpis");
      const attention = await media(ctx, "needs attention", "GET", "/stats/attention");
      const storage = await media(ctx, "storage by type", "GET", "/stats/storage");
      const recent = await media(ctx, "recent", "GET", "/stats/recent");
      await ctx.verify("the statistics", [
        check("files: four plus the provisioned one", itemValue(kpis.body, "files") === 5, kpis.body),
        check("added in the last 30 days", JSON.stringify(list(kpis.body, "items").find((row) => pick(row, "id") === "files")).includes('"value":5'), kpis.body),
        check("public files", itemValue(kpis.body, "public") === 1, kpis.body),
        check("missing alt", itemValue(kpis.body, "missing-alt") === 2, kpis.body),
        check("attention: two images without alt, one of them public", itemValue(attention.body, "missing-alt") === 2 && JSON.stringify(list(attention.body, "items").find((row) => pick(row, "id") === "missing-alt")).includes('"value":1'), attention.body),
        check("attention: a failed upload today", JSON.stringify(attention.body).includes("failed"), attention.body),
        check("attention: a file over 20 MB", JSON.stringify(attention.body).includes("large") || JSON.stringify(attention.body).includes("20"), attention.body),
        check("storage counts the original of the edited image", Number(pick(storage.body, "value")) > storageBefore, [storageBefore, pick(storage.body, "value")]),
        check("recently added starts with the newest", text(list(recent.body, "assets")[0], "id") === huge.id, recent.body),
      ]);
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto("/modules/media/overview");
      await ctx.verify("the page's blocks, top to bottom", [
        tab.visible({ role: "link", name: "Open library" }, { timeoutMs: 30_000 }),
        tab.visible({ role: "group", name: "Live updates" }),
        tab.shows(/needs attention/i),
        tab.shows(/Describe the 2 images without alt text/),
        tab.visible({ role: "link", name: /^Files 5/ }),
        tab.visible({ role: "link", name: /^Public files 1/ }),
        tab.shows(/originals of edited images included/i),
        tab.visible({ role: "link", name: "See the largest files" }),
        tab.shows(/recently added/i),
        tab.shows(/lourd\.pdf/),
      ]);
      await tab.click({ role: "link", name: "See the largest files" });
      await ctx.verify("See the largest files opens that view", [tab.at(/^\/modules\/media\/files/), check("view=largest", tab.page.url().includes("view=largest"), tab.page.url())]);
      await tab.goto("/modules/media/overview");
      await tab.click({ role: "link", name: "Open library" });
      await ctx.verify("Open library opens the Library", [tab.at(/^\/modules\/media\/files$/)]);
    },
  },
  {
    id: "the-plan-shows-on-the-storage-kpi",
    title: "with storageQuotaBytes set, the storage KPI measures the use against the plan",
    entryPoint: "storageQuotaBytes, GET /api/media/stats/kpis, /api/media/tree",
    async run(/** @type {Ctx} */ ctx) {
      await withConfig(ctx, { VERIFY_MEDIA_QUOTA: "1000000" }, async () => {
        const kpis = await media(ctx, "KPIs with a plan", "GET", "/stats/kpis");
        const read = await tree(ctx);
        await ctx.verify("the plan", [
          check("the storage KPI names the plan", JSON.stringify(list(kpis.body, "items").find((row) => pick(row, "id") === "storage")).includes("storage_quota_detail"), kpis.body),
          check("the tree gives the quota", pick(read.answer.body, "quotaBytes") === 1000000, pick(read.answer.body, "quotaBytes")),
        ]);
      });
    },
  },
  {
    id: "an-empty-library-offers-four-starter-folders",
    title: "while the library is empty the Overview offers to create Catalog, Marketing, Brand and Documents in one click",
    entryPoint: "/modules/media/overview, Start your media library",
    async run(/** @type {Ctx} */ ctx) {
      const read = await tree(ctx);
      for (const folder of read.folders.filter((row) => !pick(row, "parentId") && !pick(row, "bound"))) await media(ctx, `delete ${text(folder, "name")}`, "DELETE", `/folders/${text(folder, "id")}`);
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto("/modules/media/overview");
      await ctx.verify("the offer shows", [tab.shows(/Start your media library/, { timeoutMs: 30_000 })]);
      await tab.page.getByRole("button", { name: /Create|starter/i }).first().click({ timeout: 15_000 }).catch(() => undefined);
      await tab.page.waitForTimeout(2000);
      const after = await tree(ctx);
      const roots = after.folders.filter((row) => !pick(row, "parentId")).map((row) => text(row, "name"));
      await tab.reload();
      await ctx.verify("four folders in one click", [check("Catalog, Marketing, Brand, Documents", ["Catalog", "Marketing", "Brand", "Documents"].every((name) => roots.includes(name)), roots), tab.shows(/Start your media library/, { not: true, timeoutMs: 5000 })]);
    },
  },
  {
    id: "the-drop-zone-remembers-the-last-folder",
    title: "the drop zone asks for the folder the first time, uploads the chosen files and files dropped anywhere on the page there, and the browser remembers it next time",
    entryPoint: "/modules/media/overview, Choose a folder, Choose files",
    async run(/** @type {Ctx} */ ctx) {
      const name = ctx.unique("Drop");
      const folder = await createFolder(ctx, name);
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto("/modules/media/overview");
      await ctx.verify("the first time, the folder comes first", [tab.shows(/Pick the folder they go to first/, { timeoutMs: 30_000 })]);
      await tab.click({ role: "button", name: "Choose a folder" });
      await tab.page.getByRole("dialog").getByText(name).first().click({ timeout: 15_000 }).catch(() => undefined);
      await tab.page.getByRole("dialog").getByRole("button", { name: /Choose|Select|Use/ }).last().click({ timeout: 15_000 }).catch(() => undefined);
      await chooseFiles(ctx, tab, [{ name: "posé.png", mimeType: "image/png", buffer: await image(ctx, { width: 8, height: 8 }) }], /^Choose files/);
      let listed = await media(ctx, "list the folder", "GET", `/folders/${folder.id}/assets`);
      for (let attempt = 0; attempt < 20 && list(listed.body, "assets").length === 0; attempt += 1) {
        await tab.page.waitForTimeout(1000);
        listed = await media(ctx, "list the folder again", "GET", `/folders/${folder.id}/assets`);
      }
      const dropped = await image(ctx, { width: 9, height: 9 });
      await tab.page.locator("body").evaluate((element, base64) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], "lâché.png", { type: "image/png" }));
        for (const type of ["dragenter", "dragover", "drop"]) element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
      }, dropped.toString("base64"));
      for (let attempt = 0; attempt < 20 && list(listed.body, "assets").length < 2; attempt += 1) {
        await tab.page.waitForTimeout(1000);
        listed = await media(ctx, "list the folder after the drop", "GET", `/folders/${folder.id}/assets`);
      }
      await tab.reload();
      await ctx.verify("the file went there, and the folder is remembered", [
        check("a file dropped on the page goes to the same folder", list(listed.body, "assets").some((row) => pick(row, "name") === "lâché.png"), listed.body),
        check("posé.png is in the folder", list(listed.body, "assets").some((row) => pick(row, "name") === "posé.png"), listed.body),
        tab.shows(new RegExp(name), { timeoutMs: 20_000 }),
        tab.shows(/Pick the folder they go to first/, { not: true, timeoutMs: 3000 }),
      ]);
    },
  },
  ...activityJourneys(),
  ...renderedJourneys(),
  ...overviewFigureJourneys(),
]);
