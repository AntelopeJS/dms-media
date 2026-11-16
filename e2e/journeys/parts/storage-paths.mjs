import { storedRow } from "../../clock.mjs";
import { createFolder, declareAsset, uploaded } from "../../library.mjs";
import { existsSync } from "node:fs";
import { check, image, pick, storagePath, TENANT, text } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const storagePathsIncludeTheTenant = {
  id: "storage-paths-include-the-tenant",
  title: "a declared file and an uploaded file are stored under media/<tenantId>/<folderId>/ in the file storage, so storage paths include the tenant ID",
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
    const declaredFile = storagePath(ctx, "files", "media", TENANT, String(pick(declaredRow, "folderId")), ...declaredKey.split("/"));
    const uploadFile = storagePath(ctx, "files", ...uploadKey.split("/"));
    await ctx.verify("the storage paths", [
      check(`the declared file is stored under media/${TENANT}/<its folder>/`, declaredRow !== null && existsSync(declaredFile), [declaredKey, declaredFile]),
      check(`the uploaded file's key is under media/${TENANT}/${folder.id}/`, uploadKey.startsWith(`media/${TENANT}/${folder.id}/`), uploadKey),
      check("and the uploaded file is stored there", existsSync(uploadFile), uploadFile),
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
