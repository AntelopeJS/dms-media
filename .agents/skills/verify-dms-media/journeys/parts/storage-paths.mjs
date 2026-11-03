import { storedRow } from "../../clock.mjs";
import { createFolder, declareAsset, uploaded } from "../../library.mjs";
import { check, image, pick, TENANT, text } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const storagePathsIncludeTheTenant = {
  id: "storage-paths-include-the-tenant",
  title: "a declared file and an uploaded file are stored under media/<tenantId>/<folderId>/, so storage paths include the tenant ID",
  entryPoint: "ImportMediaAsset, POST /api/media/upload/*, the stored storageKey",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Paths"));
    const declared = await declareAsset(ctx, { key: ctx.unique("verify.path"), folder: { key: "verify.provisioned" }, name: "chemin.txt", mimetype: "text/plain", source: { kind: "bytes", base64: Buffer.from("chemin").toString("base64") } });
    const declaredId = text(declared.body, "result", "id");
    const upload = await uploaded(ctx, { folderId: folder.id, name: "envoi.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
    const declaredRow = await storedRow(ctx, "media_assets", declaredId);
    const uploadRow = await storedRow(ctx, "media_assets", upload.id);
    const declaredKey = String(pick(declaredRow, "storageKey"));
    const uploadKey = String(pick(uploadRow, "storageKey"));
    await ctx.verify("the storage keys", [
      check(`the declared file is under media/${TENANT}/<its folder>/`, declaredRow !== null && declaredKey.startsWith(`media/${TENANT}/${String(pick(declaredRow, "folderId"))}/`), declaredKey),
      check(`the uploaded file is under media/${TENANT}/${folder.id}/`, uploadKey.startsWith(`media/${TENANT}/${folder.id}/`), uploadKey),
    ]);
  },
};

/**
 * Where the module stores files.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function storagePathJourneys() {
  return [storagePathsIncludeTheTenant];
}
