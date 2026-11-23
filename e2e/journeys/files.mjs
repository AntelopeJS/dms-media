import { guarded } from "../guard.mjs";
import {
  createFolder,
  deliveryPath,
  follow,
  setVisibility,
  uploaded,
} from "../library.mjs";
import {
  check,
  image,
  list,
  longText,
  media,
  pick,
  sha256,
} from "../media.mjs";
import { filePageEditJourneys } from "./parts/file-page-edits.mjs";
import { filePageJourneys } from "./parts/file-page.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */

/** A file's page and what the API keeps of it across a backend restart. */
export const journeys = guarded([
  {
    id: "stored-files-stay-readable",
    title:
      "a file and its folder written before a restart of the backend read back unchanged after it: listing, details, delivery bytes and a size",
    entryPoint:
      "backend restart, GET /api/media/folders/:id/assets, GET /media/...",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Kept"));
      const bytes = longText(30_000);
      const photoBytes = await image(ctx, { width: 320, height: 200 });
      const doc = await uploaded(ctx, {
        folderId: folder.id,
        name: "notes été.txt",
        mimetype: "text/plain",
        bytes,
      });
      const photo = await uploaded(ctx, {
        folderId: folder.id,
        name: "vue.png",
        mimetype: "image/png",
        bytes: photoBytes,
      });
      await media(
        ctx,
        "describe the photo",
        "POST",
        `/assets/${photo.id}/update`,
        { body: { alt: "Vue" } },
      );
      await setVisibility(ctx, "assets", photo.id, "public");
      await follow(ctx, `/media/${photo.id}/thumb/vue.png`);
      await ctx.restartBackend();
      const listed = await media(
        ctx,
        "list the folder after the restart",
        "GET",
        `/folders/${folder.id}/assets`,
      );
      const delivered = await follow(ctx, deliveryPath(doc.asset), {
        as: "admin",
      });
      const thumb = await follow(ctx, `/media/${photo.id}/thumb/vue.png`);
      const read = await media(
        ctx,
        "read the photo",
        "GET",
        `/assets/${photo.id}`,
      );
      await ctx.verify("everything reads back", [
        check(
          "both files listed",
          list(listed.body, "assets").length === 2,
          listed.body,
        ),
        check(
          "the text's bytes",
          delivered.file !== null &&
            sha256(delivered.file.bytes) === sha256(bytes),
          delivered.link.status,
        ),
        check(
          "the photo's alt, visibility and size",
          pick(read.body, "asset", "alt") === "Vue" &&
            pick(read.body, "asset", "visibility") === "public" &&
            pick(read.body, "asset", "width") === 320,
          read.body,
        ),
        check(
          "its rendering is served anonymously",
          thumb.link.status === 302 && thumb.file?.status === 200,
          thumb.link.status,
        ),
      ]);
    },
  },
  ...filePageJourneys(),
  ...filePageEditJourneys(),
]);
