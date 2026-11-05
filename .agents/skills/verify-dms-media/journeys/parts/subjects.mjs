import { createFolder, folderAssets, member, uploaded, withConfig } from "../../library.mjs";
import { check, fixture, image, media, pick } from "../../media.mjs";
import { hasRights, probeRights } from "../bindings.mjs";
import { boundFolder } from "../folders.mjs";

/** @typedef {import("../../media.mjs").Ctx} Ctx */

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aRoleSubjectGrantsItsHolders = {
  id: "a-role-subject-grants-its-holders",
  title: "an ACL entry whose subject kind is role grants its rights to the members holding that role, and nothing to a member with another role",
  entryPoint: "rootAcl with { subject: { kind: \"role\", id } }",
  async run(/** @type {Ctx} */ ctx) {
    const folder = await createFolder(ctx, ctx.unique("Roles"));
    const holder = await member(ctx, "roleholder", ["unrelated.page"]);
    await member(ctx, "otherrole", ["unrelated.page"]);
    await withConfig(ctx, { VERIFY_MEDIA_ROOT_ACL: `role:${holder.roleId}:read` }, async () => {
      await ctx.verify("the role subject", [
        check("the member's role has an id", holder.roleId !== "", holder.roleId),
        hasRights(await probeRights(ctx, folder.id, "roleholder"), "read", "the member holding the role"),
        hasRights(await probeRights(ctx, folder.id, "otherrole"), "none", "a member with another role"),
      ]);
    });
  },
};

/** @type {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }} */
const aWriteMappingGrantsWriteOnly = {
  id: "a-write-mapping-grants-write-only",
  title: "a binding's write mapping, and the page fallback, grant write and not manage: the member uploads and renames files, but creating or renaming a folder answers 403, even with subfolders allowed",
  entryPoint: "RegisterAssetBinding permissionMapping.write, permissionsFromPage, POST /api/media/folders as a member",
  async run(/** @type {Ctx} */ ctx) {
    const stamp = ctx.unique("wr").replace(/[^a-z0-9]/gi, "");
    const checks = [];
    const cases = [
      { label: "write mapping", config: { id: `verify.${stamp}.w`, permissionMapping: { write: ["verify.wonly"] }, subfolders: true }, who: "wonly", grants: ["verify.wonly"] },
      { label: "page fallback", config: { id: `verify.${stamp}.p`, permissionsFromPage: "fields", subfolders: true }, who: "pagewriter", grants: ["page:fields"] },
    ];
    for (const entry of cases) {
      await fixture(ctx, `RegisterAssetBinding ${entry.config.id}`, "POST", "/binding", entry.config);
      const folderId = await boundFolder(ctx, entry.config.id);
      await member(ctx, entry.who, entry.grants);
      const put = await uploaded(ctx, { folderId, name: `${entry.who}.png`, mimetype: "image/png", bytes: await image(ctx, { width: 4, height: 4 }), as: entry.who });
      const listed = await folderAssets(ctx, folderId, { as: entry.who });
      const rename = await media(ctx, `${entry.who} renames the file`, "POST", `/assets/${put.id}/update`, { body: { name: `${entry.who} renamed.png` }, as: entry.who });
      const sub = await media(ctx, `${entry.who} creates a subfolder`, "POST", "/folders", { body: { name: "Sous", parentId: folderId }, as: entry.who });
      const own = await createFolder(ctx, `${entry.who} owner-made`, { parentId: folderId });
      const folderRename = await media(ctx, `${entry.who} renames a subfolder`, "POST", `/folders/${own.id}/rename`, { body: { name: "Renamed" }, as: entry.who });
      checks.push(
        check(`${entry.label}: the member uploads`, put.confirm?.status === 200 && listed.assets.some((row) => pick(row, "id") === put.id), [put.presign.status, put.confirm?.status]),
        check(`${entry.label}: the member renames a file`, rename.status === 200, rename.body),
        check(`${entry.label}: creating a subfolder answers 403`, sub.status === 403, sub.body),
        check(`${entry.label}: renaming a subfolder answers 403`, folderRename.status === 403, folderRename.body),
      );
    }
    await ctx.verify("write is not manage", checks);
  },
};

/**
 * Journeys of ACL subjects and of the rights a binding's mapping grants.
 *
 * @returns {{ id: string, title: string, entryPoint: string, run: (ctx: Ctx) => Promise<void> }[]} The journeys
 */
export function subjectJourneys() {
  return [aRoleSubjectGrantsItsHolders, aWriteMappingGrantsWriteOnly];
}
