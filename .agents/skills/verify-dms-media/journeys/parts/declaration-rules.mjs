import { declareAsset, declareFolder, tree } from "../../library.mjs";
import { check, media, pick, text } from "../../media.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/**
 * @param {import("../../media.mjs").Answer} answer A declaration's answer
 * @returns {string} The status, or the rejection message
 */
function outcomeOf(answer) {
  return pick(answer.body, "ok") === true ? text(answer.body, "result", "status") : `rejected: ${text(answer.body, "error")}`;
}

/**
 * The whole error a refused declaration rejects with: its kind, its key and the reason, as the interface docs give
 * it (`Media folder '<key>': <reason>`). A string reason must match exactly; a pattern stands for a reason whose
 * wording comes from the validation library.
 *
 * @param {import("../../media.mjs").Answer} answer The declaration's answer
 * @param {"folder" | "file"} kind What was declared
 * @param {string} key The declaration's key
 * @param {string} what The rule
 * @param {string | RegExp} reason The reason the error must carry
 * @returns {import("../../media.mjs").Check} The check
 */
function rejected(answer, kind, key, what, reason) {
  const got = outcomeOf(answer).normalize("NFC");
  const prefix = `rejected: Media ${kind} '${key}': `;
  const rest = got.startsWith(prefix) ? got.slice(prefix.length) : "";
  const matches = reason instanceof RegExp ? reason.test(rest) : rest === reason.normalize("NFC");
  return check(`${what}: rejected as Media ${kind} '${key}': ${String(reason)}`, matches, got);
}

/** The reason a name with a character Windows or macOS cannot save is refused with. */
const FORBIDDEN = "name: a name can't contain / \\ < > : \" | ? * or control characters";
/** The reason a name over 255 characters is refused with. */
const TOO_LONG = "name: the name is limited to 255 characters";

/**
 * Journeys of the declaration rules the dashboard's rules mirror.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function declarationRuleJourneys() {
  return [
    {
      id: "folder-declarations-follow-the-dashboards-rules",
      title: "a declared folder refuses / \\ < > : \" | ? * and control characters, more than 255 characters, a sibling's name whatever its case or Unicode form, an undeclared, deleted or own parent, an unregistered binding or one without subfolders, and an ACL entry without rights; the key is trimmed and 1 to 255 characters",
      entryPoint: "EnsureMediaFolder validation",
      async run(/** @type {Ctx} */ ctx) {
        const base = ctx.unique("verify.rules");
        const parent = await declareFolder(ctx, { key: base, name: "Été" });
        const checks = [];
        let index = 0;
        for (const name of ["a/b", "a\\b", "a<b", "a>b", "a:b", 'a"b', "a|b", "a?b", "a*b", "a\u0007b", "n".repeat(256)]) {
          index += 1;
          const key = `${base}.bad${index}`;
          checks.push(rejected(await declareFolder(ctx, { key, name }), "folder", key, `name ${JSON.stringify(name.slice(0, 12))}`, name.length > 255 ? TOO_LONG : FORBIDDEN));
        }
        const sibling = await declareFolder(ctx, { key: `${base}.twin`, name: "Twin", parent: base });
        const twin = await declareFolder(ctx, { key: `${base}.twin2`, name: "TWIN", parent: base });
        const decomposed = await declareFolder(ctx, { key: `${base}.twin3`, name: "Été" });
        const elsewhere = await declareFolder(ctx, { key: `${base}.inside-ete`, name: "Été", parent: base });
        const undeclared = await declareFolder(ctx, { key: `${base}.orphan`, name: "Orphan", parent: `${base}.nowhere` });
        const self = await declareFolder(ctx, { key: `${base}.self`, name: "Self", parent: `${base}.self` });
        const doomed = await declareFolder(ctx, { key: `${base}.doomed`, name: "Doomed" });
        await media(ctx, "delete the declared folder", "DELETE", `/folders/${text(doomed.body, "result", "id")}`);
        const underDeleted = await declareFolder(ctx, { key: `${base}.under`, name: "Under", parent: `${base}.doomed` });
        const noBinding = await declareFolder(ctx, { key: `${base}.nob`, name: "NoBinding", parent: { binding: "verify.unknown" } });
        const lockedBinding = await declareFolder(ctx, { key: `${base}.locked`, name: "Locked", parent: { binding: "verify.cover" } });
        const noRights = await declareFolder(ctx, { key: `${base}.acl`, name: "Acl", acl: [{ subject: { kind: "permission", id: "x" }, rights: [] }] });
        const spaced = await declareFolder(ctx, { key: `  ${base}.spaced  `, name: "Spaced" });
        const sameKey = await declareFolder(ctx, { key: `${base}.spaced`, name: "Spaced again" });
        const emptyKey = await declareFolder(ctx, { key: "   ", name: "Empty key" });
        const longKey = await declareFolder(ctx, { key: "k".repeat(256), name: "Long key" });
        const maxKey = await declareFolder(ctx, { key: "m".repeat(255), name: ctx.unique("Max key") });
        const read = await tree(ctx);
        await ctx.verify("each folder rule", [
          ...checks,
          check("the first sibling is created", outcomeOf(sibling) === "created" && outcomeOf(parent) === "created", sibling.body),
          rejected(twin, "folder", `${base}.twin2`, "a sibling's name in capitals", "a folder named 'TWIN' already exists there"),
          rejected(decomposed, "folder", `${base}.twin3`, "a root name in another Unicode form", "a folder named 'Été' already exists there"),
          check("the same name is fine in another folder", outcomeOf(elsewhere) === "created", elsewhere.body),
          check("no refused folder was created", !read.folders.some((folder) => ["TWIN", "Orphan", "Self", "Under", "NoBinding", "Locked", "Acl"].includes(text(folder, "name"))), read.folders.map((folder) => pick(folder, "name"))),
          rejected(undeclared, "folder", `${base}.orphan`, "an undeclared parent", `'${base}.nowhere' is not a declared folder: declare it with EnsureMediaFolder first`),
          rejected(self, "folder", `${base}.self`, "its own parent", "a folder cannot be its own parent"),
          rejected(underDeleted, "folder", `${base}.under`, "a deleted parent", `the folder declared as '${base}.doomed' was deleted`),
          rejected(noBinding, "folder", `${base}.nob`, "an unregistered binding", "no folder is bound to 'verify.unknown': register the binding with AssetType or RegisterAssetBinding first"),
          rejected(lockedBinding, "folder", `${base}.locked`, "a binding without subfolders", "the folder linked to 'verify.cover' cannot hold subfolders: register its binding with subfolders: true"),
          rejected(noRights, "folder", `${base}.acl`, "an ACL entry without rights", /^acl\.0\.rights: .+/),
          check("a key with spaces is trimmed: the same key is kept", outcomeOf(spaced) === "created" && outcomeOf(sameKey) === "kept", [spaced.body, sameKey.body]),
          rejected(emptyKey, "folder", "   ", "a blank key", /^key: .+/),
          rejected(longKey, "folder", "k".repeat(256), "a key of 256 characters", /^key: .+/),
          check("255 characters are accepted", outcomeOf(maxKey) === "created", maxKey.body),
        ]);
      },
    },
    {
      id: "file-declarations-follow-the-dashboards-rules",
      title: "a declared file refuses / \\ and control characters or more than 255 characters in its name, an empty file, alt text over 255 characters and an undeclared folder; a colon is fine in a file name",
      entryPoint: "ImportMediaAsset validation",
      async run(/** @type {Ctx} */ ctx) {
        const base = ctx.unique("verify.files");
        await declareFolder(ctx, { key: base, name: ctx.unique("Files") });
        /** @param {string} suffix @param {Record<string, unknown>} fields @returns {Promise<import("../../media.mjs").Answer>} */
        const declare = (suffix, fields) => declareAsset(ctx, { key: `${base}.${suffix}`, folder: { key: base }, name: "ok.txt", mimetype: "text/plain", source: { kind: "bytes", base64: "b2s=" }, ...fields });
        const checks = [];
        let index = 0;
        for (const name of ["a/b.txt", "a\\b.txt", "a\u0001b.txt", `${"n".repeat(252)}.txt`]) {
          index += 1;
          checks.push(rejected(await declare(`n${index}`, { name }), "file", `${base}.n${index}`, `name ${JSON.stringify(name.slice(0, 10))}`, name.length > 255 ? TOO_LONG : FORBIDDEN));
        }
        const colon = await declare("colon", { name: "a:b.txt" });
        const empty = await declare("empty", { source: { kind: "bytes", base64: "" } });
        const longAlt = await declare("alt", { alt: "a".repeat(256) });
        const maxAlt = await declare("altok", { alt: "a".repeat(255) });
        const maxName = await declare("nameok", { name: `${"n".repeat(251)}.txt` });
        const noFolder = await declareAsset(ctx, { key: `${base}.nofolder`, folder: { key: `${base}.missing` }, name: "x.txt", mimetype: "text/plain", source: { kind: "bytes", base64: "eA==" } });
        await ctx.verify("each file rule", [
          ...checks,
          check("a colon is fine", outcomeOf(colon) === "created", colon.body),
          rejected(empty, "file", `${base}.empty`, "an empty file", "declaration: the file is empty"),
          rejected(longAlt, "file", `${base}.alt`, "alt over 255", "alt: the alt text is limited to 255 characters"),
          check("alt of 255 is fine", outcomeOf(maxAlt) === "created", maxAlt.body),
          check("a name of exactly 255 characters is fine", outcomeOf(maxName) === "created", maxName.body),
          rejected(noFolder, "file", `${base}.nofolder`, "an undeclared folder", `'${base}.missing' is not a declared folder: declare it with EnsureMediaFolder first`),
        ]);
      },
    },
  ];
}
