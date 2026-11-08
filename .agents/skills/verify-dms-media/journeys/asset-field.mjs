import { guarded } from "../guard.mjs";
import { openFilePicker } from "../chooser.mjs";
import { createFolder, declareFolder, folderAssets, member, uploaded } from "../library.mjs";
import { check, fixture, image, pick, text } from "../media.mjs";
import { boundFolder } from "./folders.mjs";
import { dragFile, landed } from "./parts/picker-files.mjs";

/**
 * @typedef {import("../media.mjs").Ctx} Ctx
 * @typedef {import("../media.mjs").Tab} Tab
 */

/**
 * Opens a field's picker, clicking again while the page hydrates.
 *
 * @param {Tab} tab The tab on the field page
 * @param {string} field The field's label
 * @returns {Promise<boolean>} Whether the picker opened
 */
async function openPicker(tab, field) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await tab.page.getByRole("button", { name: field, exact: true }).click({ timeout: 10_000 }).catch(() => undefined);
    if (await tab.page.getByRole("dialog", { name: "Choose from the library" }).isVisible().catch(() => false)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

/**
 * Asks the fixture's `AssetType` whether its validation accepts each value.
 *
 * @param {Ctx} ctx The journey
 * @param {Record<string, unknown>} options The field options
 * @param {unknown[]} values The values
 * @returns {Promise<unknown>} One boolean per value
 */
async function accepts(ctx, options, values) {
  const answer = await fixture(ctx, `validate ${JSON.stringify(options)}`, "POST", "/validate", { options, values });
  return pick(answer.body, "accepted");
}

/** The `AssetType` form field: its value, its validation, its picker and its uploads. */
export const journeys = guarded([
  {
    id: "the-value-is-asset-ids-checked-for-shape-only",
    title: "by default one nonempty id; multiple takes an array of nonempty ids, the empty one included; max caps it only in multiple mode; an unknown id passes",
    entryPoint: "new AssetType(options).getValidation()",
    async run(/** @type {Ctx} */ ctx) {
      const single = await accepts(ctx, {}, ["asset-a", "", ["asset-a"], 3, null, "never-uploaded"]);
      const multiple = await accepts(ctx, { multiple: true }, [[], ["asset-a", "asset-b"], ["asset-a", ""], "asset-a", [3]]);
      const capped = await accepts(ctx, { multiple: true, max: 4 }, [["a", "b", "c", "d"], ["a", "b", "c", "d", "e"]]);
      const singleWithMax = await accepts(ctx, { max: 0 }, ["asset-a"]);
      const typed = await accepts(ctx, { mimetypes: ["image/*"] }, ["a-pdf-id"]);
      await ctx.verify("the shapes", [
        check("single: an id yes, empty no, array no, number no, null no, unknown id yes", JSON.stringify(single) === JSON.stringify([true, false, false, false, false, true]), single),
        check("multiple: [] yes, ids yes, an empty id no, a bare id no, numbers no", JSON.stringify(multiple) === JSON.stringify([true, true, false, false, false]), multiple),
        check("max 4: four yes, a fifth no", JSON.stringify(capped) === JSON.stringify([true, false]), capped),
        check("max does not apply in single mode", JSON.stringify(singleWithMax) === JSON.stringify([true]), singleWithMax),
        check("mimetypes are not checked by validation", JSON.stringify(typed) === JSON.stringify([true]), typed),
      ]);
    },
  },
  {
    id: "the-field-declares-its-picker-and-binding",
    title: "the package registers the asset data type, the field's input is dms-media-asset-picker with its options and the binding id but never the ACL, and a binding given to the field registers a folder accepting its types",
    entryPoint: "ASSET_DATA_TYPE_ID, ASSET_PICKER_COMPONENT, AssetType binding",
    async run(/** @type {Ctx} */ ctx) {
      const answer = await fixture(ctx, "read the constants and a serialized field", "GET", "/constants");
      const options = pick(answer.body, "serialized", "inputComponent", "options");
      const folderId = await boundFolder(ctx, "verify.constants");
      const listed = await fixture(ctx, "read the constants once more", "GET", "/constants");
      await ctx.verify("the declared field", [
        check("ASSET_DATA_TYPE_ID is asset", pick(answer.body, "dataType") === "asset", answer.body),
        check("ASSET_PICKER_COMPONENT is dms-media-asset-picker", pick(answer.body, "component") === "dms-media-asset-picker", answer.body),
        check("importing the package registered the type", pick(answer.body, "registered") === true, answer.body),
        check("the input component is the picker", pick(answer.body, "serialized", "inputComponent", "componentName") === "dms-media-asset-picker", answer.body),
        check("its options: multiple, max, mimetypes, bindingId", JSON.stringify(options) === JSON.stringify({ multiple: true, max: 3, mimetypes: ["image/png"], bindingId: "verify.constants" }), options),
        check("never the ACL", !JSON.stringify(answer.body).includes("acl"), answer.body),
        check("the binding's folder exists and accepts the field's types", folderId !== "", folderId),
        check("constructing the field again creates no second binding", listed.status === 200, listed.status),
      ]);
    },
  },
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
  {
    id: "the-pickers-upload-targets-the-linked-folder",
    title: "a linked field's picker browsed into a subfolder still sends its Upload and a drop on it to the linked folder itself",
    entryPoint: "/verify-fields, Projects picker, Chantier Nord, Upload and a drop",
    async run(/** @type {Ctx} */ ctx) {
      const projects = await boundFolder(ctx, "verify.projects");
      const sub = await createFolder(ctx, "Chantier Nord", { parentId: projects });
      await member(ctx, "picker", ["page:fields"]);
      const tab = await ctx.tab("picker");
      await tab.signIn("picker");
      await tab.goto("/verify-fields");
      const projectsOpened = await openPicker(tab, "Projects");
      await ctx.verify("the picker opens", [check("the dialog", projectsOpened, projectsOpened)]);
      const pickerDialog = tab.page.getByRole("dialog", { name: "Choose from the library" });
      await pickerDialog.getByRole("button", { name: /^Chantier Nord/ }).dblclick({ timeout: 10_000 }).catch(() => undefined);
      const inside = await tab.visible({ role: "heading", name: "Chantier Nord", level: 2 }, { timeoutMs: 10_000 });
      const fromPicker = await openFilePicker(tab, () => pickerDialog.getByRole("button", { name: "Upload", exact: true }).click({ timeout: 10_000 }).catch(() => undefined), 20_000);
      await fromPicker.choose([{ name: "depuis-le-picker.png", mimeType: "image/png", buffer: await image(ctx, { width: 6, height: 6 }) }]);
      /** @param {string} name */
      const settled = (name) => landed(ctx, { bound: projects, sub: sub.id }, name, "picker");
      const afterUpload = await settled("depuis-le-picker.png");
      await ctx.verify("its Upload targets the linked folder even from a subfolder", [inside, check("the file is in the linked folder itself, not the subfolder", afterUpload.bound.includes("depuis-le-picker.png") && !afterUpload.sub.includes("depuis-le-picker.png"), afterUpload)]);
      await pickerDialog.getByRole("button", { name: /^Chantier Nord/ }).dblclick({ timeout: 10_000 }).catch(() => undefined);
      const stillInside = await tab.visible({ role: "heading", name: "Chantier Nord", level: 2 }, { timeoutMs: 10_000 });
      const dropped = await image(ctx, { width: 7, height: 7 });
      await dragFile(pickerDialog.getByRole("main"), "depose-dans-le-picker.png", dropped, ["dragenter", "dragover"]);
      await ctx.verify("the drop overlay names the linked folder", [tab.shows(/Drop 1 file to upload to Verify projects/, { timeoutMs: 5000 }), tab.shows(/Drop 1 file to upload to Chantier Nord/, { not: true, timeoutMs: 1000 })]);
      await dragFile(pickerDialog.getByRole("main"), "depose-dans-le-picker.png", dropped, ["drop"]);
      const afterDrop = await settled("depose-dans-le-picker.png");
      await ctx.verify("a drop on the picker targets the linked folder even from a subfolder", [stillInside, check("the dropped file is in the linked folder itself, not the subfolder", afterDrop.bound.includes("depose-dans-le-picker.png") && !afterDrop.sub.includes("depose-dans-le-picker.png"), afterDrop)]);
    },
  },
  {
    id: "a-read-only-linked-folder-uploads-into-the-writable-folder-shown",
    title: "a picker whose linked folder the member cannot write sends its Upload and a drop to the writable subfolder it shows, without asking where",
    entryPoint: "/verify-fields, Projects picker bound read-only, writable Chantier Sud, a drop and Upload",
    async run(/** @type {Ctx} */ ctx) {
      await fixture(ctx, "RegisterAssetBinding verify.projects read-only", "POST", "/binding", { id: "verify.projects", folderName: "Verify projects", subfolders: true, permissionMapping: { write: [] }, permissionsFromPage: "fields" });
      const projects = await boundFolder(ctx, "verify.projects");
      const declared = await declareFolder(ctx, { key: ctx.unique("verify.sud"), name: "Chantier Sud", parent: { binding: "verify.projects" }, acl: [{ subject: { kind: "permission", id: "verify.sud.write" }, rights: ["write"] }] });
      const sub = text(declared.body, "result", "id");
      await member(ctx, "lecteur", ["page:fields", "verify.sud.write"]);
      const tab = await ctx.tab("lecteur");
      await tab.signIn("lecteur");
      await tab.goto("/verify-fields");
      const opened = await openPicker(tab, "Projects");
      await ctx.verify("the picker opens", [check("the dialog", opened, opened)]);
      const pickerDialog = tab.page.getByRole("dialog", { name: "Choose from the library" });
      await pickerDialog.getByRole("button", { name: /^Chantier Sud/ }).dblclick({ timeout: 10_000 }).catch(() => undefined);
      const inside = await tab.visible({ role: "heading", name: "Chantier Sud", level: 2 }, { timeoutMs: 10_000 });
      /** @param {string} name */
      const settled = (name) => landed(ctx, { bound: projects, sub }, name, "lecteur");
      await dragFile(pickerDialog.getByRole("main"), "lecteur-depose.png", await image(ctx, { width: 8, height: 8 }), ["dragenter", "dragover"]);
      const named = tab.shows(/Drop 1 file to upload to Chantier Sud/, { timeoutMs: 5000 });
      await dragFile(pickerDialog.getByRole("main"), "lecteur-depose.png", await image(ctx, { width: 8, height: 8 }), ["drop"]);
      const afterDrop = await settled("lecteur-depose.png");
      const unasked = await tab.visible({ role: "heading", name: "Where should the files go?" }, { hidden: true, timeoutMs: 2000 });
      await ctx.verify("a drop goes to the writable subfolder shown, with no question", [inside, named, unasked, check("the dropped file is in Chantier Sud", afterDrop.sub.includes("lecteur-depose.png") && !afterDrop.bound.includes("lecteur-depose.png"), afterDrop)]);
      const fromPicker = await openFilePicker(tab, () => pickerDialog.getByRole("button", { name: "Upload", exact: true }).click({ timeout: 10_000 }).catch(() => undefined), 20_000);
      await fromPicker.choose([{ name: "lecteur-bouton.png", mimeType: "image/png", buffer: await image(ctx, { width: 9, height: 9 }) }]);
      const afterUpload = await settled("lecteur-bouton.png");
      await ctx.verify("Upload goes there too", [check("the uploaded file is in Chantier Sud", afterUpload.sub.includes("lecteur-bouton.png") && !afterUpload.bound.includes("lecteur-bouton.png"), afterUpload)]);
    },
  },
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
