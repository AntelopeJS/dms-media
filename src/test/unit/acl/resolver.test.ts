import { expect } from "chai";
import { DEFAULT_ROOT_ACL } from "../../../acl/defaults";
import { serializeAcl } from "../../../acl/entries";
import {
  type AclActor,
  resolveFolderAccess,
  resolveRootRights,
} from "../../../acl/resolver";
import {
  MEDIA_ACCESS_PERMISSION,
  MEDIA_FOLDERS_MANAGE_PERMISSION,
  MEDIA_UPLOAD_PERMISSION,
} from "../../../constants";
import type { MediaFolder } from "../../../db/tables";
import type { AclEntry } from "../../../types";

interface FolderSeed {
  id: string;
  parentId?: string;
  acl?: AclEntry[];
  rawAcl?: string;
}

function buildFolder(seed: FolderSeed): MediaFolder {
  return {
    _id: seed.id,
    name: seed.id,
    parentId: seed.parentId,
    path: [],
    json_acl: seed.rawAcl ?? serializeAcl(seed.acl),
    visibility: "private",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as MediaFolder;
}

function buildActor(permissions: string[], roleIds: string[] = []): AclActor {
  return { permissions: new Set(permissions), roleIds };
}

const EDIT_ARTICLES_PERMISSION = "articles.table.edit";

const editorsRoleAcl: AclEntry[] = [
  { subject: { kind: "role", id: "editors" }, rights: ["write"] },
];

const articlesPermissionAcl: AclEntry[] = [
  {
    subject: { kind: "permission", id: EDIT_ARTICLES_PERMISSION },
    rights: ["write"],
  },
];

describe("[unit] acl/resolver — resolveFolderAccess", () => {
  it("grants everything everywhere to the owner wildcard", () => {
    const folders = [
      buildFolder({ id: "a" }),
      buildFolder({ id: "b", parentId: "a", acl: [] }),
    ];
    const access = resolveFolderAccess(folders, buildActor(["*"]), []);
    expect([...access.manageable].sort()).to.deep.equal(["a", "b"]);
    expect([...access.readable].sort()).to.deep.equal(["a", "b"]);
    expect(access.shells.size).to.equal(0);
  });

  it("applies the root ACL to folders without their own ACL", () => {
    const folders = [buildFolder({ id: "root" })];
    const reader = resolveFolderAccess(
      folders,
      buildActor([MEDIA_ACCESS_PERMISSION]),
      DEFAULT_ROOT_ACL,
    );
    expect(reader.readable.has("root")).to.equal(true);
    expect(reader.writable.has("root")).to.equal(false);
    expect(reader.manageable.has("root")).to.equal(false);
  });

  it("expands right implications (write ⇒ read, manage ⇒ write+read)", () => {
    const folders = [buildFolder({ id: "root" })];
    const uploader = resolveFolderAccess(
      folders,
      buildActor([MEDIA_UPLOAD_PERMISSION]),
      DEFAULT_ROOT_ACL,
    );
    expect(uploader.readable.has("root")).to.equal(true);
    expect(uploader.writable.has("root")).to.equal(true);
    expect(uploader.manageable.has("root")).to.equal(false);

    const manager = resolveFolderAccess(
      folders,
      buildActor([MEDIA_FOLDERS_MANAGE_PERMISSION]),
      DEFAULT_ROOT_ACL,
    );
    expect(manager.readable.has("root")).to.equal(true);
    expect(manager.writable.has("root")).to.equal(true);
    expect(manager.manageable.has("root")).to.equal(true);
  });

  it("propagates the parent's effective rights when a child has no ACL", () => {
    const folders = [
      buildFolder({ id: "parent", acl: editorsRoleAcl }),
      buildFolder({ id: "child", parentId: "parent" }),
      buildFolder({ id: "grandchild", parentId: "child" }),
    ];
    const editor = resolveFolderAccess(
      folders,
      buildActor([], ["editors"]),
      [],
    );
    expect(editor.writable.has("child")).to.equal(true);
    expect(editor.writable.has("grandchild")).to.equal(true);
  });

  it("lets a folder ACL fully override the inherited one", () => {
    const restrictedAcl: AclEntry[] = [
      { subject: { kind: "role", id: "admins" }, rights: ["manage"] },
    ];
    const folders = [
      buildFolder({ id: "parent", acl: editorsRoleAcl }),
      buildFolder({ id: "child", parentId: "parent", acl: restrictedAcl }),
    ];
    const editor = resolveFolderAccess(
      folders,
      buildActor([], ["editors"]),
      [],
    );
    expect(editor.writable.has("parent")).to.equal(true);
    expect(editor.readable.has("child")).to.equal(false);

    const admin = resolveFolderAccess(folders, buildActor([], ["admins"]), []);
    expect(admin.readable.has("parent")).to.equal(false);
    expect(admin.manageable.has("child")).to.equal(true);
  });

  it("matches permission subjects against the actor's effective permission set", () => {
    const folders = [
      buildFolder({ id: "articles-assets", acl: articlesPermissionAcl }),
    ];
    const magasinier = resolveFolderAccess(
      folders,
      buildActor([EDIT_ARTICLES_PERMISSION]),
      [],
    );
    expect(magasinier.writable.has("articles-assets")).to.equal(true);

    const outsider = resolveFolderAccess(
      folders,
      buildActor([MEDIA_ACCESS_PERMISSION]),
      [],
    );
    expect(outsider.readable.has("articles-assets")).to.equal(false);
  });

  it("returns non-readable ancestors of readable folders as shells", () => {
    const folders = [
      buildFolder({ id: "top", acl: [] }),
      buildFolder({ id: "middle", parentId: "top" }),
      buildFolder({ id: "leaf", parentId: "middle", acl: editorsRoleAcl }),
    ];
    const editor = resolveFolderAccess(
      folders,
      buildActor([], ["editors"]),
      [],
    );
    expect(editor.readable.has("leaf")).to.equal(true);
    expect(editor.readable.has("top")).to.equal(false);
    expect(editor.readable.has("middle")).to.equal(false);
    expect([...editor.shells].sort()).to.deep.equal(["middle", "top"]);
  });

  it("keeps unreadable folders out of every set", () => {
    const folders = [
      buildFolder({ id: "hidden", acl: [] }),
      buildFolder({ id: "hidden-child", parentId: "hidden" }),
    ];
    const actor = resolveFolderAccess(
      folders,
      buildActor([MEDIA_ACCESS_PERMISSION]),
      [],
    );
    expect(actor.readable.size).to.equal(0);
    expect(actor.writable.size).to.equal(0);
    expect(actor.manageable.size).to.equal(0);
    expect(actor.shells.size).to.equal(0);
  });

  it("treats folders with a missing parent as roots", () => {
    const folders = [buildFolder({ id: "orphan", parentId: "gone" })];
    const reader = resolveFolderAccess(
      folders,
      buildActor([MEDIA_ACCESS_PERMISSION]),
      DEFAULT_ROOT_ACL,
    );
    expect(reader.readable.has("orphan")).to.equal(true);
  });

  it("grants every root right to the owner wildcard", () => {
    const rights = resolveRootRights(buildActor(["*"]), []);
    expect(rights.has("read")).to.equal(true);
    expect(rights.has("write")).to.equal(true);
    expect(rights.has("manage")).to.equal(true);
  });

  it("matches any permission subject for the owner wildcard", () => {
    const folders = [
      buildFolder({ id: "articles-assets", acl: articlesPermissionAcl }),
    ];
    const owner = resolveFolderAccess(folders, buildActor(["*"]), []);
    expect(owner.manageable.has("articles-assets")).to.equal(true);
  });

  it("resolves root rights from the root ACL for regular actors", () => {
    const rights = resolveRootRights(
      buildActor([MEDIA_UPLOAD_PERMISSION]),
      DEFAULT_ROOT_ACL,
    );
    expect(rights.has("write")).to.equal(true);
    expect(rights.has("manage")).to.equal(false);
  });

  it("falls back to inheritance when a stored ACL is malformed", () => {
    const folders = [
      buildFolder({ id: "root", acl: editorsRoleAcl }),
      buildFolder({ id: "broken", parentId: "root", rawAcl: "{not json" }),
    ];
    const editor = resolveFolderAccess(
      folders,
      buildActor([], ["editors"]),
      [],
    );
    expect(editor.writable.has("broken")).to.equal(true);
  });

  it("locks down a child with an explicit empty ACL under a permissive parent", () => {
    const folders = [
      buildFolder({ id: "open", acl: editorsRoleAcl }),
      buildFolder({ id: "locked", parentId: "open", acl: [] }),
    ];
    const editor = resolveFolderAccess(
      folders,
      buildActor([], ["editors"]),
      [],
    );
    expect(editor.writable.has("open")).to.equal(true);
    expect(editor.readable.has("locked")).to.equal(false);
    expect(editor.shells.has("locked")).to.equal(false);
  });

  it("ignores unknown rights and unknown subject kinds", () => {
    // The fixture is deliberately not an AclEntry -- an unknown right
    // and an unknown subject kind are what this test feeds the resolver.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions
    const exoticAcl = [
      { subject: { kind: "role", id: "editors" }, rights: ["teleport"] },
      { subject: { kind: "group", id: "editors" }, rights: ["manage"] },
    ] as unknown as AclEntry[];
    const folders = [buildFolder({ id: "root", acl: exoticAcl })];
    const editor = resolveFolderAccess(
      folders,
      buildActor([], ["editors"]),
      [],
    );
    expect(editor.readable.size).to.equal(0);
    expect(editor.writable.size).to.equal(0);
    expect(editor.manageable.size).to.equal(0);
  });

  it("stays finite and grants nothing on a parentId cycle", () => {
    const folders = [
      buildFolder({ id: "a", parentId: "b" }),
      buildFolder({ id: "b", parentId: "a" }),
      buildFolder({ id: "sane" }),
    ];
    const reader = resolveFolderAccess(
      folders,
      buildActor([MEDIA_ACCESS_PERMISSION]),
      DEFAULT_ROOT_ACL,
    );
    expect(reader.readable.has("sane")).to.equal(true);
    expect(reader.readable.has("a")).to.equal(false);
    expect(reader.readable.has("b")).to.equal(false);
  });
});
