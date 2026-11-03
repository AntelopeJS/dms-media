import { createFolder, setVisibility, uploaded } from "../../library.mjs";
import { check, image, list, media, pick } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/**
 * The figure the Files KPI shows on the page.
 *
 * @param {import("../../media.mjs").Tab} tab The tab on the Overview
 * @returns {Promise<string>} The KPI link's name
 */
async function filesKpi(tab) {
  return (await tab.page.getByRole("link", { name: /^Files \d+/ }).first().textContent({ timeout: 10_000 }).catch(() => "")) ?? "";
}

/**
 * Journeys of the Activity page and of live updates.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function activityJourneys() {
  return [
    {
      id: "activity-lists-every-write-by-kind",
      title: "the Activity feed lists every write, the latest 50 grouped by day, and its tabs and the type filter keep uploads, edits, moves, deletions, visibility or folders; the page is hidden from the sidebar and opens from View all",
      entryPoint: "/modules/media/activity, GET /api/media/activity?type=",
      async run(/** @type {Ctx} */ ctx) {
        const folder = await createFolder(ctx, ctx.unique("Feed"));
        const target = await createFolder(ctx, ctx.unique("Feed target"));
        const file = await uploaded(ctx, { folderId: folder.id, name: "feed.png", mimetype: "image/png", bytes: await image(ctx, { width: 8, height: 8 }) });
        const doomed = await uploaded(ctx, { folderId: folder.id, name: "doomed.txt", mimetype: "text/plain", bytes: Buffer.from("d") });
        await media(ctx, "rotate", "POST", `/assets/${file.id}/transform`, { body: { rotate: 90 } });
        await media(ctx, "move", "POST", `/assets/${file.id}/move`, { body: { folderId: target.id } });
        await setVisibility(ctx, "assets", file.id, "public");
        await media(ctx, "delete", "DELETE", `/assets/${doomed.id}`);
        for (let index = 0; index < 55; index += 1) await media(ctx, `rename ${index}`, "POST", `/folders/${target.id}/rename`, { body: { name: `Feed target ${index}` } });
        const all = list((await media(ctx, "the feed, asking for more than 50", "GET", "/activity?limit=60")).body, "items");
        /** @param {string} type @returns {Promise<string[]>} */
        const titles = async (type) => list((await media(ctx, `activity ${type || "all"}`, "GET", `/activity${type ? `?type=${type}` : ""}`)).body, "items").map((row) => String(pick(row, "title")));
        const kinds = { uploads: await titles("uploads"), edits: await titles("edits"), moves: await titles("moves"), deletions: await titles("deletions"), visibility: await titles("visibility"), folders: await titles("folders") };
        await ctx.verify("each filter", [
          check("the latest 50 events, newest first", all.length === 50 && JSON.stringify(pick(all[0], "params")).includes("Feed target 54"), [all.length, pick(all[0], "params")]),
          check("uploads", kinds.uploads.length >= 2 && kinds.uploads.every((title) => title.includes("upload")), kinds.uploads),
          check("edits", kinds.edits.some((title) => title.includes("transform")), kinds.edits),
          check("moves", kinds.moves.some((title) => title.includes("move")), kinds.moves),
          check("deletions", kinds.deletions.some((title) => title.includes("delete")), kinds.deletions),
          check("visibility", kinds.visibility.some((title) => title.includes("visibility")), kinds.visibility),
          check("folders", kinds.folders.some((title) => title.includes("folder")), kinds.folders),
        ]);
        const tab = await ctx.tab();
        await tab.signIn("admin");
        await tab.goto("/modules/media/overview");
        const sixLatest = await tab.page.getByRole("link", { name: /^Verify Admin renamed/ }).count();
        await ctx.verify("the page is hidden from the sidebar", [
          check("the Overview's activity shows the six latest events", sixLatest === 6, sixLatest),tab.visible({ role: "link", name: "Activity" }, { hidden: true }), tab.visible({ role: "link", name: "View all" })]);
        await tab.page.getByRole("link", { name: "View all" }).first().click();
        await ctx.verify("View all opens it, grouped by day", [tab.at(/^\/modules\/media\/activity$/, { timeoutMs: 20_000 }), tab.visible({ role: "heading", name: /^Today · /, level: 3 })]);
        const pageRows = await tab.page.getByRole("tabpanel").getByRole("link").count();
        await ctx.verify("the page shows the latest 50", [check("50 entries", pageRows === 50, pageRows)]);
        await ctx.verify("its tabs", ["All", "Uploads", "Edits", "Moves", "Deletions", "Visibility", "Folders"].map((name) => tab.visible({ role: "tab", name })));
        await tab.click({ role: "tab", name: "Moves" });
        await ctx.verify("Moves keeps the move", [tab.shows(/moved feed\.png/, { timeoutMs: 15_000 }), tab.shows(/renamed|uploaded 2 files/, { not: true, timeoutMs: 3000 })]);
      },
    },
    {
      id: "live-pages-follow-the-library-unless-paused",
      title: "the Overview follows a change made elsewhere; paused it does not read and counts the changes it missed; Live reads them at once; L switches; the choice is shared by the live pages and kept; ?live=0 opens paused",
      entryPoint: "/modules/media/overview, /modules/media/uploads, Live updates toolbar",
      async run(/** @type {Ctx} */ ctx) {
        const folder = await createFolder(ctx, ctx.unique("Live"));
        const tab = await ctx.tab();
        await tab.signIn("admin");
        await tab.goto("/modules/media/overview");
        await tab.visible({ role: "group", name: "Live updates" }, { timeoutMs: 30_000 });
        const before = await filesKpi(tab);
        await uploaded(ctx, { folderId: folder.id, name: "one.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
        await ctx.verify("a change elsewhere shows without a reload", [tab.visible({ role: "link", name: /^Files 2/ }, { timeoutMs: 15_000 }), check("it was 1 before", before.startsWith("Files1") || before.startsWith("Files 1"), before)]);
        await tab.click({ role: "button", name: "Pause" });
        await uploaded(ctx, { folderId: folder.id, name: "two.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
        await uploaded(ctx, { folderId: folder.id, name: "three.png", mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }) });
        await tab.page.waitForTimeout(5000);
        await ctx.verify("paused, nothing is read and the missed changes are counted", [tab.visible({ role: "link", name: /^Files 2/ }), tab.shows(/2 changes/, { timeoutMs: 15_000 })]);
        await tab.click({ role: "button", name: "Live" });
        await ctx.verify("Live reads them at once", [tab.visible({ role: "link", name: /^Files 4/ }, { timeoutMs: 10_000 })]);
        await tab.page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => undefined);
        await tab.press("l");
        await ctx.verify("L pauses", [tab.visible({ role: "button", name: "Pause", pressed: true }, { timeoutMs: 5000 })]);
        await tab.goto("/modules/media/uploads");
        await ctx.verify("the Uploads page shares the choice", [tab.visible({ role: "button", name: "Pause", pressed: true }, { timeoutMs: 20_000 })]);
        await tab.press("l");
        await tab.goto("/modules/media/overview?live=0");
        await ctx.verify("?live=0 opens paused", [tab.visible({ role: "button", name: "Pause", pressed: true }, { timeoutMs: 20_000 })]);
      },
    },
  ];
}
