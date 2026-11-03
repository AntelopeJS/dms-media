import { closeSync, ftruncateSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { guarded } from "../guard.mjs";
import { declareAsset, declareFolder, follow, tree, withConfig } from "../library.mjs";
import { check, image, list, longText, media, pick, sha256, text } from "../media.mjs";
import { boundFolder } from "./folders.mjs";
import { declarationRuleJourneys } from "./parts/declaration-rules.mjs";

/** @typedef {import("../media.mjs").Ctx} Ctx */

/**
 * @param {import("../media.mjs").Answer} answer A declaration's answer
 * @returns {string} The status it returned, or the message it rejected with
 */
export function outcomeOf(answer) {
  return pick(answer.body, "ok") === true ? text(answer.body, "result", "status") : `rejected: ${text(answer.body, "error")}`;
}

/** Folders and files shipped as code with `EnsureMediaFolder` and `ImportMediaAsset`. */
export const journeys = guarded([
  {
    id: "a-declaration-is-written-once",
    title: "a folder and a file are created once per key: a second declaration returns kept with the first id, writes nothing and never reads the source again; the file's bytes, dimensions and System activity are right",
    entryPoint: "EnsureMediaFolder, ImportMediaAsset",
    async run(/** @type {Ctx} */ ctx) {
      const key = ctx.unique("verify.once");
      const folder = await declareFolder(ctx, { key, name: "Procédures" });
      const again = await declareFolder(ctx, { key, name: "Another name" });
      const bytes = await image(ctx, { width: 640, height: 480 });
      const asset = await declareAsset(ctx, { key: `${key}.file`, folder: { key }, name: "Plan été.png", mimetype: "image/png", alt: "Plan du site", source: { kind: "load", base64: bytes.toString("base64") } });
      const assetAgain = await declareAsset(ctx, { key: `${key}.file`, folder: { key }, name: "Other.png", mimetype: "image/png", source: { kind: "load", base64: bytes.toString("base64") } });
      const id = text(asset.body, "result", "id");
      const read = await media(ctx, "read the declared file", "GET", `/assets/${id}`);
      const delivered = await follow(ctx, `/media/${id}/${encodeURIComponent("Plan été.png")}`, { as: "admin" });
      const read2 = await tree(ctx);
      const named = read2.folders.filter((row) => pick(row, "name") === "Procédures" || pick(row, "name") === "Another name");
      const history = await media(ctx, "read the file's history", "GET", `/assets/${id}/history`);
      const activity = await media(ctx, "read the activity", "GET", "/activity?type=folders");
      await ctx.verify("written once", [
        check("the folder is created", outcomeOf(folder) === "created", folder.body),
        check("the second declaration is kept with the same id", outcomeOf(again) === "kept" && text(again.body, "result", "id") === text(folder.body, "result", "id"), again.body),
        check("nothing renamed or added", named.length === 1 && pick(named[0], "name") === "Procédures", named),
        check("the file is created, its source read once", outcomeOf(asset) === "created" && pick(asset.body, "loads") === 1, asset.body),
        check("kept, its source never read again", outcomeOf(assetAgain) === "kept" && pick(assetAgain.body, "loads") === 0 && text(assetAgain.body, "result", "id") === id, assetAgain.body),
        check("its name, alt and computed dimensions", pick(read.body, "asset", "name") === "Plan été.png" && pick(read.body, "asset", "alt") === "Plan du site" && pick(read.body, "asset", "width") === 640 && pick(read.body, "asset", "height") === 480, read.body),
        check("every byte is stored", delivered.file !== null && sha256(delivered.file.bytes) === sha256(bytes), delivered.link.status),
        check("the upload is recorded, attributed to System", JSON.stringify(history.body).includes("activity.asset_upload") && pick(list(history.body, "items")[0], "params", "actor") === "System", history.body),
        check("the folder creation is recorded, attributed to System", JSON.stringify(activity.body).includes("Procédures") && JSON.stringify(activity.body).includes("System"), activity.body),
      ]);
    },
  },
  {
    id: "every-source-kind-is-read",
    title: "a file comes from bytes in memory, a path on the backend's disk or a load function, each stored byte for byte, multi-chunk and outside ASCII",
    entryPoint: "ImportMediaAsset source bytes, filePath, load",
    async run(/** @type {Ctx} */ ctx) {
      const key = ctx.unique("verify.sources");
      await declareFolder(ctx, { key, name: ctx.unique("Sources") });
      const content = longText(6000);
      const path = join(ctx.state.home, `${key.replace(/\W+/g, "-")}.txt`);
      writeFileSync(path, content);
      const results = [];
      const sources = [
        { kind: "bytes", source: { kind: "bytes", base64: content.toString("base64") } },
        { kind: "filePath", source: { kind: "filePath", filePath: path } },
        { kind: "load", source: { kind: "load", base64: content.toString("base64") } },
      ];
      for (const { kind, source } of sources) {
        const answer = await declareAsset(ctx, { key: `${key}.${kind}`, folder: { key }, name: `${kind} — été.txt`, mimetype: "text/plain", source });
        const id = text(answer.body, "result", "id");
        const delivered = await follow(ctx, `/media/${id}/${encodeURIComponent(`${kind} — été.txt`)}`, { as: "admin" });
        results.push(check(`${kind}: created with every byte`, outcomeOf(answer) === "created" && delivered.file !== null && sha256(delivered.file.bytes) === sha256(content), [answer.body, delivered.file?.bytes.byteLength]));
      }
      await ctx.verify("each source kind", results);
    },
  },
  {
    id: "the-tenant-must-be-named",
    title: "an omitted, empty or blank tenantId rejects before any write or source read, with no default; surrounding whitespace is trimmed",
    entryPoint: "EnsureMediaFolder and ImportMediaAsset tenantId",
    async run(/** @type {Ctx} */ ctx) {
      const before = await tree(ctx);
      const outcomes = [];
      for (const tenantId of [undefined, "", "   "]) {
        const key = ctx.unique("verify.tenant");
        const folder = await declareFolder(ctx, { key, name: `T ${key}`, tenantId });
        const asset = await declareAsset(ctx, { key: `${key}.f`, folder: { key: "verify.provisioned" }, name: "t.txt", mimetype: "text/plain", source: { kind: "load", base64: "dA==" }, tenantId });
        outcomes.push(check(`tenantId ${JSON.stringify(tenantId)} rejects`, outcomeOf(folder).startsWith("rejected") && outcomeOf(asset).startsWith("rejected"), [folder.body, asset.body]));
        outcomes.push(check(`tenantId ${JSON.stringify(tenantId)} reads no source`, pick(asset.body, "loads") === 0, asset.body));
      }
      const after = await tree(ctx);
      const trimmed = await declareFolder(ctx, { key: ctx.unique("verify.trim"), name: ctx.unique("Trimmed"), tenantId: "  default  " });
      await ctx.verify("no tenant, no write", [
        ...outcomes,
        check("nothing was created", after.folders.length === before.folders.length, [before.folders.length, after.folders.length]),
        check("a tenant with surrounding spaces is trimmed", outcomeOf(trimmed) === "created", trimmed.body),
      ]);
    },
  },
  {
    id: "parents-bindings-visibility-and-acl",
    title: "a folder goes at the root, under a declared parent named by its key as a string or { key }, or under a binding that allows subfolders; visibility defaults to private; a file goes into a binding's folder",
    entryPoint: "EnsureMediaFolder parent, visibility, acl; ImportMediaAsset folder { binding }",
    async run(/** @type {Ctx} */ ctx) {
      const key = ctx.unique("verify.tree");
      const root = await declareFolder(ctx, { key, name: ctx.unique("Root") });
      const byString = await declareFolder(ctx, { key: `${key}.a`, name: "A", parent: key });
      const byKey = await declareFolder(ctx, { key: `${key}.b`, name: "B", parent: { key }, visibility: "public" });
      const underBinding = await declareFolder(ctx, { key: `${key}.c`, name: ctx.unique("Projet"), parent: { binding: "verify.projects" } });
      const intoBinding = await declareAsset(ctx, { key: `${key}.cover`, folder: { binding: "verify.cover" }, name: "cover.png", mimetype: "image/png", source: { kind: "bytes", base64: (await image(ctx, { width: 8, height: 8 })).toString("base64") } });
      const read = await tree(ctx);
      /** @param {import("../media.mjs").Answer} answer @returns {Record<string, unknown> | undefined} */
      const row = (answer) => read.folders.find((folder) => pick(folder, "id") === text(answer.body, "result", "id"));
      const cover = await boundFolder(ctx, "verify.cover");
      const projects = await boundFolder(ctx, "verify.projects");
      const file = await media(ctx, "read the file put in the binding's folder", "GET", `/assets/${text(intoBinding.body, "result", "id")}`);
      await ctx.verify("each placement", [
        check("at the root, private by default", pick(row(root), "parentId") === null && pick(row(root), "visibility") === "private", row(root)),
        check("parent as a string key", pick(row(byString), "parentId") === text(root.body, "result", "id"), row(byString)),
        check("parent as { key }, public when declared so", pick(row(byKey), "parentId") === text(root.body, "result", "id") && pick(row(byKey), "visibility") === "public", row(byKey)),
        check("under the binding that allows subfolders", pick(row(underBinding), "parentId") === projects, row(underBinding)),
        check("a file into { binding }", outcomeOf(intoBinding) === "created" && pick(file.body, "asset", "folderId") === cover, file.body),
      ]);
    },
  },
  {
    id: "the-provisioning-hook-ships-content-for-a-new-tenant",
    title: "declarations made from Hook.TENANT_BEING_PROVISIONED, as the docs prescribe, are in a fresh tenant's library, recorded as System's",
    entryPoint: "Hook.TENANT_BEING_PROVISIONED in the playground's construct()",
    async run(/** @type {Ctx} */ ctx) {
      const read = await tree(ctx);
      const provisioned = read.folders.find((folder) => pick(folder, "name") === "Provisioned");
      const files = await media(ctx, "list the provisioned folder", "GET", `/folders/${text(provisioned, "id")}/assets`);
      const asset = list(files.body, "assets")[0];
      const history = await media(ctx, "read its history", "GET", `/assets/${text(asset, "id")}/history`);
      await ctx.verify("the shipped content", [
        check("the folder is there", provisioned !== undefined, read.folders.map((folder) => pick(folder, "name"))),
        check("with its file", pick(asset, "name") === "procedure.txt", files.body),
        check("uploaded by System", JSON.stringify(history.body).includes("System"), history.body),
      ]);
    },
  },
  {
    id: "the-limits-of-an-upload-apply",
    title: "a declared file over 500 MiB, over the storage plan, of a type the library or the bound field refuses, or an image that does not decode is refused with an error naming its kind and key; a decoded image is stored under the decoded type",
    entryPoint: "ImportMediaAsset upload rules",
    async run(/** @type {Ctx} */ ctx) {
      const key = ctx.unique("verify.limits");
      await declareFolder(ctx, { key, name: ctx.unique("Limits") });
      const big = join(ctx.state.home, "big.bin");
      const handle = openSync(big, "w");
      ftruncateSync(handle, 500 * 1024 * 1024 + 1);
      closeSync(handle);
      const tooBig = await declareAsset(ctx, { key: `${key}.big`, folder: { key }, name: "big.pdf", mimetype: "application/pdf", source: { kind: "filePath", filePath: big } });
      writeFileSync(big, "");
      const html = await declareAsset(ctx, { key: `${key}.html`, folder: { key }, name: "page.html", mimetype: "text/html", source: { kind: "bytes", base64: "PHA+" } });
      const htm = await declareAsset(ctx, { key: `${key}.htm`, folder: { key }, name: "page.htm", mimetype: "text/plain", source: { kind: "bytes", base64: "PHA+" } });
      const exe = await declareAsset(ctx, { key: `${key}.exe`, folder: { key }, name: "tool.exe", mimetype: "application/x-msdownload", source: { kind: "bytes", base64: "TVo=" } });
      const field = await declareAsset(ctx, { key: `${key}.field`, folder: { binding: "verify.sheets" }, name: "x.png", mimetype: "image/png", source: { kind: "bytes", base64: (await image(ctx, { width: 4, height: 4 })).toString("base64") } });
      const broken = await declareAsset(ctx, { key: `${key}.broken`, folder: { key }, name: "broken.jpg", mimetype: "image/jpeg", source: { kind: "bytes", base64: Buffer.from("nope").toString("base64") } });
      const claimed = await declareAsset(ctx, { key: `${key}.claimed`, folder: { key }, name: "really-jpeg.png", mimetype: "image/png", source: { kind: "bytes", base64: (await image(ctx, { width: 9, height: 7, format: "jpeg" })).toString("base64") } });
      const claimedRead = await media(ctx, "read the claimed PNG", "GET", `/assets/${text(claimed.body, "result", "id")}`);
      /** @param {import("../media.mjs").Answer} answer @param {string} name @returns {import("../media.mjs").Check} */
      const named = (answer, name) => check(`${name} refused, naming Media file '<key>'`, outcomeOf(answer).startsWith(`rejected: Media file '${key}.${name}'`), answer.body);
      await withConfig(ctx, { VERIFY_MEDIA_QUOTA: "10" }, async () => {
        const over = await declareAsset(ctx, { key: `${key}.quota`, folder: { key }, name: "q.txt", mimetype: "text/plain", source: { kind: "bytes", base64: Buffer.alloc(64, 97).toString("base64") } });
        await ctx.verify("the upload rules", [
          named(tooBig, "big"),
          named(html, "html"),
          named(exe, "exe"),
          named(htm, "htm"),
          named(field, "field"),
          named(broken, "broken"),
          named(over, "quota"),
          check("a JPEG declared as PNG is stored as image/jpeg", pick(claimedRead.body, "asset", "mimetype") === "image/jpeg" && pick(claimedRead.body, "asset", "width") === 9, claimedRead.body),
        ]);
      });
    },
  },
  ...declarationRuleJourneys(),
]);
