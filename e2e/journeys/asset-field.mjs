import { guarded } from "../guard.mjs";
import { openFilePicker } from "../chooser.mjs";
import { createFolder, folderAssets, member, uploaded } from "../library.mjs";
import { check, image, pick, text } from "../media.mjs";
import { boundFolder } from "./folders.mjs";
import { fieldEntryJourneys } from "./parts/field-entries.mjs";
import { openPicker, pickerDestinationJourneys, pickerUploadJourneys } from "./parts/picker-uploads.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */

/** The `AssetType` form field: its value, its validation, its picker and its uploads. */
export const journeys = guarded([
  {
    id: "the-picker-shows-what-the-field-accepts",
    title: "the picker says what the field accepts, shows a file of another type but refuses it, lets a PDF be chosen, and the form stores the asset id, never a URL",
    entryPoint: "/verify-fields, PDF only field, Choose from the library",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Picked"));
      const pdf = await uploaded(ctx, { folderId: folder.id, name: "fiche.pdf", mimetype: "application/pdf", bytes: Buffer.from("%PDF-1.4\n%%EOF\n") });
      await uploaded(ctx, { folderId: folder.id, name: "photo.png", mimetype: "image/png", bytes: await image(ctx, { width: 8, height: 8 }) });
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto("/verify-fields");
      await ctx.verify("the fields say what they accept", [tab.shows(/Choose up to 2 PDFs/, { timeoutMs: 20_000 }), tab.shows(/Choose an image/), tab.visible({ role: "button", name: "Upload to Verify covers" })]);
      const opened = await openPicker(tab, "PDF only");
      await ctx.verify("the picker opens", [check("the dialog", opened, opened), tab.shows(/Accepts: PDF/)]);
      await tab.page.getByRole("dialog").getByRole("button", { name: /^Picked/ }).first().dblclick().catch(() => undefined);
      await tab.page.getByRole("option", { name: /^photo\.png/ }).click({ timeout: 15_000 }).catch(() => undefined);
      await ctx.verify("an image shows but is refused", [tab.visible({ role: "option", name: /^photo\.png/ }), tab.enabled({ role: "button", name: /^Choose file/ }, { disabled: true }), tab.shows(/PDF/)]);
      await tab.page.getByRole("option", { name: /^fiche\.pdf/ }).click({ timeout: 15_000 }).catch(() => undefined);
      await tab.page.getByRole("button", { name: /^Choose file/ }).click({ timeout: 15_000 }).catch(() => undefined);
      await ctx.verify("the field shows the chosen file", [tab.shows(/fiche\.pdf/, { timeoutMs: 15_000 }), tab.visible({ role: "dialog", name: "Choose from the library" }, { hidden: true })]);
      await tab.page.getByRole("button", { name: /^Save/ }).first().click({ timeout: 10_000 }).catch(() => undefined);
      let saved = await ctx.api("read the saved values", { method: "GET", path: "/api/verify-media/fields/values" });
      for (let attempt = 0; attempt < 10 && pick(saved.body, "pdf") === undefined; attempt += 1) {
        await tab.page.getByRole("button", { name: /^Save/ }).first().click({ timeout: 5000 }).catch(() => undefined);
        await tab.page.waitForTimeout(1000);
        saved = await ctx.api("read the saved values again", { method: "GET", path: "/api/verify-media/fields/values" });
      }
      await ctx.verify("the form stored the asset id", [check("pdf holds the id of fiche.pdf, not a URL", pick(saved.body, "pdf") === pdf.id, saved.body)]);
      await ctx.verify("no crop on the field", [tab.visible({ role: "button", name: /Edit image|Crop/ }, { hidden: true })]);
    },
  },
  {
    id: "uploads-from-the-field-land-in-its-folder",
    tag: "@smoke",
    title: "the field's Upload button and a drop on the field send the file to the field's linked folder",
    entryPoint: "/verify-fields, Upload to Verify covers, drop on the Cover field",
    async run(/** @type {Ctx} */ ctx) {
      const cover = await boundFolder(ctx, "verify.cover");
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto("/verify-fields");
      await tab.visible({ role: "button", name: "Upload to Verify covers" }, { timeoutMs: 20_000 });
      const folder = ctx.step("choose a file with the field's Upload button");
      const byButton = await openFilePicker(tab, () => tab.page.getByRole("button", { name: "Upload to Verify covers" }).click(), 30_000);
      await byButton.choose([{ name: "par-bouton.png", mimeType: "image/png", buffer: await image(ctx, { width: 10, height: 10 }) }]);
      ctx.record(folder, [check("the picker took the file", byButton.opened, "par-bouton.png")]);
      const dropped = await image(ctx, { width: 11, height: 11 });
      await tab.page.getByRole("button", { name: "Cover", exact: true }).evaluate((element, base64) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], "par-glisser.png", { type: "image/png" }));
        for (const type of ["dragenter", "dragover", "drop"]) element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
      }, dropped.toString("base64"));
      let listed = await folderAssets(ctx, cover);
      for (let attempt = 0; attempt < 20 && listed.assets.length < 2; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        listed = await folderAssets(ctx, cover);
      }
      const namesIn = listed.assets.map((asset) => text(asset, "name")).sort();
      await ctx.verify("both files are in the linked folder", [check("par-bouton.png and par-glisser.png", JSON.stringify(namesIn) === JSON.stringify(["par-bouton.png", "par-glisser.png"]), namesIn)]);
    },
  },
  {
    id: "a-members-picker-shows-only-what-they-can-read",
    title: "a member opening a field's picker sees only the folders they can read, and a linked field's picker opens on its folder and lists its subfolders",
    entryPoint: "/verify-fields as a member, Attachment and Projects pickers",
    async run(/** @type {Ctx} */ ctx) {
      const hidden = await createFolder(ctx, ctx.unique("Owner only"));
      const projects = await boundFolder(ctx, "verify.projects");
      await createFolder(ctx, "Chantier Nord", { parentId: projects });
      await member(ctx, "picker", ["page:fields"]);
      const tab = await ctx.tab("picker");
      await tab.signIn("picker");
      await tab.goto("/verify-fields");
      const opened = await openPicker(tab, "Attachment");
      const dialog = tab.page.getByRole("dialog", { name: "Choose from the library" });
      await ctx.verify("only readable folders", [
        check("the picker opens", opened, opened),
        tab.visible({ role: "treeitem", name: /^Content/ }),
        check("the owner-only folder exists", hidden.id !== "", hidden.answer.body),
        tab.visible({ role: "treeitem", name: /^Owner only/ }, { hidden: true }),
        tab.visible({ role: "treeitem", name: /^Provisioned/ }, { hidden: true }),
      ]);
      await dialog.getByRole("button", { name: "Close" }).click().catch(() => undefined);
      const projectsOpened = await openPicker(tab, "Projects");
      await ctx.verify("the linked field opens on its folder and lists its subfolder", [check("the picker opens", projectsOpened, projectsOpened), tab.visible({ role: "heading", name: "Verify projects", level: 2 }), tab.visible({ role: "button", name: /^Chantier Nord/ })]);
    },
  },
  ...fieldEntryJourneys(),
  ...pickerUploadJourneys(),
  ...pickerDestinationJourneys(),
  {
    id: "a-refusal-speaks-the-members-language",
    title: "a member whose language is French sees a refused file explained in French",
    entryPoint: "/verify-fields as a fr-FR member, Cover field upload of a PDF",
    async run(/** @type {Ctx} */ ctx) {
      await member(ctx, "francais", ["page:fields"], "fr");
      const tab = await ctx.tab("francais");
      await tab.signIn("francais");
      await tab.goto("/verify-fields");
      await tab.page.locator("input[type=file]").first().waitFor({ state: "attached", timeout: 30_000 }).catch(() => undefined);
      let shown = false;
      for (let attempt = 0; attempt < 5 && !shown; attempt += 1) {
        await tab.page.locator("input[type=file]").first().setInputFiles([{ name: "fiche.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") }]).catch(() => undefined);
        await tab.page.waitForTimeout(2000);
        shown = await tab.page.getByText(/fiche\.pdf n'est pas accepté/).first().isVisible().catch(() => false);
      }
      await ctx.verify("the refusal in French", [tab.shows(/fiche\.pdf n'est pas accepté/, { timeoutMs: 10_000 }), tab.shows(/is not accepted/, { not: true, timeoutMs: 2000 })]);
    },
  },
]);
