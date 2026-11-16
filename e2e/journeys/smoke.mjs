import { guarded } from "../guard.mjs";
import { createFolder, deliveryPath, folderAssets, follow, uploaded } from "../library.mjs";
import { check, image, recordRaw, sha256 } from "../media.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */

/** The introduction's "One image from upload to delivery", through the API and the Library page. */
export const journeys = guarded([
  {
    id: "smoke",
    title: "an owner uploads an image into a new folder, sees it in the Library and its delivery link serves the same bytes",
    entryPoint: "/modules/media/files, POST /api/media/upload/*, GET /media/<id>/<name>",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, "Smoke photos");
      await ctx.verify("the folder is created", [check("POST /folders answers its id", folder.answer.status === 200 && folder.id !== "", folder.answer.body)], { critical: true });
      const bytes = await image(ctx, { width: 64, height: 48, format: "jpeg" });
      const done = await uploaded(ctx, { folderId: folder.id, name: "Été à Paris.jpg", mimetype: "image/jpeg", bytes });
      const listed = await folderAssets(ctx, folder.id);
      await ctx.verify("the folder lists the file", [
        check("one file, named as uploaded", listed.assets.length === 1 && listed.assets[0]?.name === "Été à Paris.jpg", listed.assets),
        check("its size and dimensions", listed.assets[0]?.size === bytes.byteLength && listed.assets[0]?.width === 64 && listed.assets[0]?.height === 48, listed.assets[0]),
      ]);
      const tab = await ctx.tab();
      await tab.signIn("admin");
      await tab.goto(`/modules/media/files?folder=${folder.id}`);
      await ctx.verify("the Library shows the file", [tab.shows(/Été à Paris\.jpg/, { timeoutMs: 30_000 })]);
      const delivered = await follow(ctx, deliveryPath(done.asset), { as: "admin" });
      recordRaw(ctx, delivered.link, [check("the link redirects", delivered.link.status === 302, delivered.link.status)]);
      if (delivered.file)
        recordRaw(ctx, delivered.file, [
          check("the storage serves 200", delivered.file.status === 200, delivered.file.status),
          check("the same bytes as uploaded", sha256(delivered.file.bytes) === sha256(bytes), `${delivered.file.bytes.byteLength} bytes`),
        ]);
    },
  },
]);
