import { createFolder, setVisibility, uploaded } from "../../library.mjs";
import { openFilePicker, waitForHydration } from "../../chooser.mjs";
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

/** Each Activity filter, the event keys its rows may have, and one this journey's writes must show in it. */
const TAB_KINDS = new Map(Object.entries({
  uploads: { allowed: ["asset_upload", "upload_batch"], expected: "asset_upload" },
  edits: { allowed: ["asset_rename", "asset_alt", "asset_transform", "asset_revert"], expected: "asset_transform" },
  moves: { allowed: ["asset_move", "folder_move"], expected: "asset_move" },
  deletions: { allowed: ["asset_delete", "folder_delete"], expected: "asset_delete" },
  visibility: { allowed: ["asset_visibility", "folder_visibility"], expected: "asset_visibility_public" },
  folders: { allowed: ["folder_create", "folder_rename", "folder_move", "folder_delete", "folder_visibility"], expected: "folder_rename" },
}));

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
          ...Object.entries(kinds).flatMap(([tab, titles]) => {
            const { allowed, expected } = TAB_KINDS.get(tab) ?? { allowed: [], expected: "a kind" };
            const keys = titles.map((title) => title.split(".").pop() ?? "");
            return [
              check(`${tab}: every row is one of ${allowed.join(", ")}`, keys.length > 0 && keys.every((key) => allowed.some((kind) => key.startsWith(kind))), keys),
              check(`${tab}: lists ${expected}`, keys.some((key) => key.startsWith(expected)), keys),
            ];
          }),
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
    {
      id: "own-uploads-keep-moving-while-paused-and-activity-follows",
      title: "while the Overview is paused, an upload of its own drop zone still goes through; the Activity page shows a change made elsewhere without a reload",
      entryPoint: "/modules/media/overview paused, /modules/media/activity live",
      async run(/** @type {Ctx} */ ctx) {
        const name = ctx.unique("Holding");
        const folder = await createFolder(ctx, name);
        const tab = await ctx.tab();
        await tab.signIn("admin");
        await tab.goto("/modules/media/overview");
        await tab.page.getByRole("button", { name: "Choose a folder" }).click({ timeout: 20_000 }).catch(() => undefined);
        const dialog = tab.page.getByRole("dialog");
        await dialog.getByText(name).first().click({ timeout: 15_000 }).catch(() => undefined);
        await dialog.getByRole("button", { name: /Choose|Select|Use/ }).last().click({ timeout: 15_000 }).catch(() => undefined);
        await tab.click({ role: "button", name: "Pause" });
        await tab.page.route("**/file-storage/upload/**", async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          await route.continue();
        });
        const paused = await openFilePicker(tab, () => tab.page.getByRole("button", { name: /^Choose files/ }).click({ timeout: 10_000 }).catch(() => undefined), 20_000);
        await paused.choose([{ name: "pendant-la-pause.png", mimeType: "image/png", buffer: await image(ctx, { width: 6, height: 6 }) }]);
        let listed = await media(ctx, "list the folder", "GET", `/folders/${folder.id}/assets`);
        for (let attempt = 0; attempt < 30 && list(listed.body, "assets").length === 0; attempt += 1) {
          await tab.page.waitForTimeout(1000);
          listed = await media(ctx, "list the folder again", "GET", `/folders/${folder.id}/assets`);
        }
        await ctx.verify("the paused page's own upload went through", [check("the file landed", list(listed.body, "assets").length === 1, listed.body), tab.visible({ role: "button", name: "Pause", pressed: true })]);
        await tab.goto("/modules/media/activity");
        const hydrated = await waitForHydration(tab, 60_000);
        const live = tab.page.getByRole("button", { name: "Live" });
        await live.waitFor({ timeout: 30_000 }).catch(() => undefined);
        for (let attempt = 0; attempt < 10 && (await live.getAttribute("aria-pressed").catch(() => "")) !== "true"; attempt += 1) {
          await live.click({ timeout: 10_000 }).catch(() => undefined);
          await tab.page.waitForTimeout(1000);
        }
        await ctx.verify("the Activity page is live before anything changes", [check("the page hydrated, so Live is the stored choice and not the server's", hydrated, tab.page.url()), tab.visible({ role: "button", name: "Live", pressed: true }, { timeoutMs: 10_000 })]);
        await media(ctx, "rename the folder elsewhere", "POST", `/folders/${folder.id}/rename`, { body: { name: `${name} bis` } });
        await ctx.verify("the Activity feed follows", [tab.shows(new RegExp(`renamed[\\s\\S]*${name} bis|${name} bis[\\s\\S]*renamed`, "i"), { timeoutMs: 20_000 })]);
      },
    },
  ];
}
