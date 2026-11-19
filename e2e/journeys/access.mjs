import { guarded } from "../guard.mjs";
import { createFolder, member } from "../library.mjs";
import { check, media } from "../media.mjs";
import { hasRights, probeRights } from "./bindings.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */

const OWNER_ONLY_READS = ["/stats/kpis", "/stats/storage", "/stats/attention", "/stats/recent", "/activity", "/activity?type=uploads"];

/** Who may do what: owner-only pages and statistics. Its HTTP checks run in `packages/dms-media/src/test/integration/`. */
export const journeys = guarded([
  {
    id: "media-pages-and-statistics-are-owner-only",
    title: "a member, even one whose role holds the Library page permission, gets 403 from the overview and activity routes, cannot open the Media pages, and that permission grants no folder right",
    entryPoint: "GET /api/media/stats/*, /activity, /modules/media/* as a member",
    async run(/** @type {Ctx} */ ctx) {
      const folder = await createFolder(ctx, ctx.unique("Library"));
      await member(ctx, "libraryrole", ["modules.media.library.files", "page:fields"]);
      const answers = [];
      for (const path of OWNER_ONLY_READS) answers.push({ path, member: await media(ctx, `${path} as the member`, "GET", path, { as: "libraryrole" }), owner: await media(ctx, `${path} as the owner`, "GET", path) });
      const tab = await ctx.tab("libraryrole");
      await tab.signIn("libraryrole");
      const pages = [];
      for (const path of ["/modules/media/overview", "/modules/media/files", "/modules/media/uploads", "/modules/media/presets"]) {
        await tab.goto(path);
        await tab.visible({ role: "heading", level: 1 }, { timeoutMs: 15_000 });
        pages.push({ path, at: new URL(tab.page.url()).pathname, library: await tab.page.getByRole("textbox", { name: "Search the library" }).count(), sizes: await tab.page.getByRole("heading", { name: "thumb" }).count() });
      }
      await ctx.verify("owner-only", [
        ...answers.map((row) => check(`${row.path}: 403 for the member, 200 for the owner`, row.member.status === 403 && row.owner.status === 200, [row.member.status, row.owner.status])),
        ...pages.map((row) => check(`${row.path} is not shown to the member`, row.at !== row.path && row.library === 0 && row.sizes === 0, row)),
        hasRights(await probeRights(ctx, folder.id, "libraryrole"), "none", "the Library page permission grants no folder right"),
      ]);
    },
  },
]);
