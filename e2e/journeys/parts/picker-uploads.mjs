import { openFilePicker } from "../../chooser.mjs";
import { createFolder, declareFolder, member } from "../../library.mjs";
import { check, fixture, image, text } from "../../media.mjs";
import { boundFolder } from "../folders.mjs";
import { dragFile, landed } from "./picker-files.mjs";

/**
 * @typedef {import("../../media.mjs").Ctx} Ctx
 * @typedef {import("../../media.mjs").Tab} Tab
 */

/**
 * Opens a field's picker, clicking again while the page hydrates.
 *
 * @param {Tab} tab The tab on the field page
 * @param {string} field The field's label
 * @returns {Promise<boolean>} Whether the picker opened
 */
export async function openPicker(tab, field) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await tab.page
      .getByRole("button", { name: field, exact: true })
      .click({ timeout: 10_000 })
      .catch(() => undefined);
    if (
      await tab.page
        .getByRole("dialog", { name: "Choose from the library" })
        .isVisible()
        .catch(() => false)
    )
      return true;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const thePickersUploadTargetsTheLinkedFolder = {
  id: "the-pickers-upload-targets-the-linked-folder",
  title:
    "a linked field's picker browsed into a subfolder still sends its Upload and a drop on it to the linked folder itself",
  entryPoint: "/e2e-fields, Projects picker, Chantier Nord, Upload and a drop",
  async run(/** @type {Ctx} */ ctx) {
    const projects = await boundFolder(ctx, "verify.projects");
    const sub = await createFolder(ctx, "Chantier Nord", {
      parentId: projects,
    });
    await member(ctx, "picker", ["page:fields"]);
    const tab = await ctx.tab("picker");
    await tab.signIn("picker");
    await tab.goto("/e2e-fields");
    const projectsOpened = await openPicker(tab, "Projects");
    await ctx.verify("the picker opens", [
      check("the dialog", projectsOpened, projectsOpened),
    ]);
    const pickerDialog = tab.page.getByRole("dialog", {
      name: "Choose from the library",
    });
    await pickerDialog
      .getByRole("button", { name: /^Chantier Nord/ })
      .dblclick({ timeout: 10_000 })
      .catch(() => undefined);
    const inside = await tab.visible(
      { role: "heading", name: "Chantier Nord", level: 2 },
      { timeoutMs: 10_000 },
    );
    const fromPicker = await openFilePicker(
      tab,
      () =>
        pickerDialog
          .getByRole("button", { name: "Upload", exact: true })
          .click({ timeout: 10_000 })
          .catch(() => undefined),
      20_000,
    );
    await fromPicker.choose([
      {
        name: "depuis-le-picker.png",
        mimeType: "image/png",
        buffer: await image(ctx, { width: 6, height: 6 }),
      },
    ]);
    /** @param {string} name */
    const settled = (name) =>
      landed(ctx, { bound: projects, sub: sub.id }, name, "picker");
    const afterUpload = await settled("depuis-le-picker.png");
    await ctx.verify(
      "its Upload targets the linked folder even from a subfolder",
      [
        inside,
        check(
          "the file is in the linked folder itself, not the subfolder",
          afterUpload.bound.includes("depuis-le-picker.png") &&
            !afterUpload.sub.includes("depuis-le-picker.png"),
          afterUpload,
        ),
      ],
    );
    await pickerDialog
      .getByRole("button", { name: /^Chantier Nord/ })
      .dblclick({ timeout: 10_000 })
      .catch(() => undefined);
    const stillInside = await tab.visible(
      { role: "heading", name: "Chantier Nord", level: 2 },
      { timeoutMs: 10_000 },
    );
    const dropped = await image(ctx, { width: 7, height: 7 });
    await dragFile(
      pickerDialog.getByRole("main"),
      "depose-dans-le-picker.png",
      dropped,
      ["dragenter", "dragover"],
    );
    await ctx.verify("the drop overlay names the linked folder", [
      tab.shows(/Drop 1 file to upload to Verify projects/, {
        timeoutMs: 5000,
      }),
      tab.shows(/Drop 1 file to upload to Chantier Nord/, {
        not: true,
        timeoutMs: 1000,
      }),
    ]);
    await dragFile(
      pickerDialog.getByRole("main"),
      "depose-dans-le-picker.png",
      dropped,
      ["drop"],
    );
    const afterDrop = await settled("depose-dans-le-picker.png");
    await ctx.verify(
      "a drop on the picker targets the linked folder even from a subfolder",
      [
        stillInside,
        check(
          "the dropped file is in the linked folder itself, not the subfolder",
          afterDrop.bound.includes("depose-dans-le-picker.png") &&
            !afterDrop.sub.includes("depose-dans-le-picker.png"),
          afterDrop,
        ),
      ],
    );
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aReadOnlyLinkedFolderUploadsIntoTheWritableFolderShown = {
  id: "a-read-only-linked-folder-uploads-into-the-writable-folder-shown",
  title:
    "a picker whose linked folder the member cannot write sends its Upload and a drop to the writable subfolder it shows, without asking where",
  entryPoint:
    "/e2e-fields, Projects picker bound read-only, writable Chantier Sud, a drop and Upload",
  async run(/** @type {Ctx} */ ctx) {
    await fixture(
      ctx,
      "RegisterAssetBinding verify.projects read-only",
      "POST",
      "/binding",
      {
        id: "verify.projects",
        folderName: "Verify projects",
        subfolders: true,
        permissionMapping: { write: [] },
        permissionsFromPage: "fields",
      },
    );
    const projects = await boundFolder(ctx, "verify.projects");
    const declared = await declareFolder(ctx, {
      key: ctx.unique("verify.sud"),
      name: "Chantier Sud",
      parent: { binding: "verify.projects" },
      acl: [
        {
          subject: { kind: "permission", id: "verify.sud.write" },
          rights: ["write"],
        },
      ],
    });
    const sub = text(declared.body, "result", "id");
    await member(ctx, "lecteur", ["page:fields", "verify.sud.write"]);
    const tab = await ctx.tab("lecteur");
    await tab.signIn("lecteur");
    await tab.goto("/e2e-fields");
    const opened = await openPicker(tab, "Projects");
    await ctx.verify("the picker opens", [check("the dialog", opened, opened)]);
    const pickerDialog = tab.page.getByRole("dialog", {
      name: "Choose from the library",
    });
    await pickerDialog
      .getByRole("button", { name: /^Chantier Sud/ })
      .dblclick({ timeout: 10_000 })
      .catch(() => undefined);
    const inside = await tab.visible(
      { role: "heading", name: "Chantier Sud", level: 2 },
      { timeoutMs: 10_000 },
    );
    /** @param {string} name */
    const settled = (name) =>
      landed(ctx, { bound: projects, sub }, name, "lecteur");
    await dragFile(
      pickerDialog.getByRole("main"),
      "lecteur-depose.png",
      await image(ctx, { width: 8, height: 8 }),
      ["dragenter", "dragover"],
    );
    const named = tab.shows(/Drop 1 file to upload to Chantier Sud/, {
      timeoutMs: 5000,
    });
    await dragFile(
      pickerDialog.getByRole("main"),
      "lecteur-depose.png",
      await image(ctx, { width: 8, height: 8 }),
      ["drop"],
    );
    const afterDrop = await settled("lecteur-depose.png");
    const unasked = await tab.visible(
      { role: "heading", name: "Where should the files go?" },
      { hidden: true, timeoutMs: 2000 },
    );
    await ctx.verify(
      "a drop goes to the writable subfolder shown, with no question",
      [
        inside,
        named,
        unasked,
        check(
          "the dropped file is in Chantier Sud",
          afterDrop.sub.includes("lecteur-depose.png") &&
            !afterDrop.bound.includes("lecteur-depose.png"),
          afterDrop,
        ),
      ],
    );
    const fromPicker = await openFilePicker(
      tab,
      () =>
        pickerDialog
          .getByRole("button", { name: "Upload", exact: true })
          .click({ timeout: 10_000 })
          .catch(() => undefined),
      20_000,
    );
    await fromPicker.choose([
      {
        name: "lecteur-bouton.png",
        mimeType: "image/png",
        buffer: await image(ctx, { width: 9, height: 9 }),
      },
    ]);
    const afterUpload = await settled("lecteur-bouton.png");
    await ctx.verify("Upload goes there too", [
      check(
        "the uploaded file is in Chantier Sud",
        afterUpload.sub.includes("lecteur-bouton.png") &&
          !afterUpload.bound.includes("lecteur-bouton.png"),
        afterUpload,
      ),
    ]);
  },
};

/**
 * Where a field picker's Upload and drops go when it can write: its linked folder, or the writable subfolder shown.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function pickerUploadJourneys() {
  return [
    thePickersUploadTargetsTheLinkedFolder,
    aReadOnlyLinkedFolderUploadsIntoTheWritableFolderShown,
  ];
}
