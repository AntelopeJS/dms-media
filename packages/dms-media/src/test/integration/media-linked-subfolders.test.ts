import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  EnsureMediaFolder,
  ImportMediaAsset,
  RegisterAssetBinding,
  UnregisterAssetBinding,
} from "@antelopejs/interface-dms-media";
import { CONTENT_ROOT_BINDING } from "../../bindings";
import {
  MediaAssetModel,
  MediaDeclarationModel,
  MediaFolderModel,
} from "../../db";
import { ONE_PIXEL_PNG, PNG_MIMETYPE } from "../helpers/assets";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const OPEN_BINDING_ID = "subfolders.photos";
const LOCKED_BINDING_ID = "subfolders.locked";
const KEY_PREFIX = "subfolders.";
const ERRORS = "$dms_media.errors";

interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  binding: string | null;
  acceptsSubfolders: boolean;
  accepts: string[] | null;
}

function folders() {
  return GetModel(MediaFolderModel, DEFAULT_TENANT_ID);
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    assert.instanceOf(error, Error);
    return error;
  }
  throw new Error("Expected the declaration to be refused");
}

/** Linked folders are locked through the API: later suites expect an empty library. */
async function removeLinkedFolders(): Promise<void> {
  const folderModel = folders();
  const assetModel = GetModel(MediaAssetModel, DEFAULT_TENANT_ID);
  const linked = await folderModel.getBy(
    "binding",
    OPEN_BINDING_ID,
    LOCKED_BINDING_ID,
  );
  const all = await folderModel.getAll();
  const doomed = all.filter((folder) =>
    linked.some(
      (entry) => entry._id === folder._id || folder.path.includes(entry._id),
    ),
  );
  const assets = await assetModel.getBy(
    "folderId",
    ...doomed.map((folder) => folder._id),
  );
  await Promise.all(assets.map((asset) => assetModel.delete(asset._id)));
  await Promise.all(doomed.map((folder) => folderModel.delete(folder._id)));
  const declarationModel = GetModel(MediaDeclarationModel, DEFAULT_TENANT_ID);
  const declarations = (await declarationModel.getAll()).filter((entry) =>
    entry.key.startsWith(KEY_PREFIX),
  );
  await Promise.all(
    declarations.map((entry) => declarationModel.delete(entry._id)),
  );
  const [contentRoot] = await folderModel.getBy(
    "binding",
    CONTENT_ROOT_BINDING,
  );
  if (!contentRoot) return;
  const children = await folderModel.getBy("parentId", contentRoot._id);
  if (children.length === 0) await folderModel.delete(contentRoot._id);
}

describe("[integration] media linked subfolders — bindings that allow them", () => {
  let client: AxiosInstance;

  async function treeFolder(binding: string): Promise<FolderNode> {
    const tree = await client.get("/api/media/tree");
    const folder = (tree.data.folders as FolderNode[]).find(
      (entry) => entry.binding === binding,
    );
    if (!folder) throw new Error(`No folder linked to ${binding}`);
    return folder;
  }

  before(async () => {
    RegisterAssetBinding({
      id: OPEN_BINDING_ID,
      folderName: "Project photos",
      subfolders: true,
      field: { mimetypes: ["image/*"] },
    });
    RegisterAssetBinding({ id: LOCKED_BINDING_ID, folderName: "Locked" });
    client = authorizedClient((await ensureOwnerSession()).accessToken);
  });

  after(async () => {
    UnregisterAssetBinding(OPEN_BINDING_ID);
    UnregisterAssetBinding(LOCKED_BINDING_ID);
    await removeLinkedFolders();
  });

  it("tells the explorer which linked folders take subfolders", async () => {
    expect((await treeFolder(OPEN_BINDING_ID)).acceptsSubfolders).to.equal(
      true,
    );
    expect((await treeFolder(LOCKED_BINDING_ID)).acceptsSubfolders).to.equal(
      false,
    );
    expect((await treeFolder(CONTENT_ROOT_BINDING)).acceptsSubfolders).to.equal(
      false,
    );
  });

  it("lets an owner create a subfolder where the binding allows it, and keeps the linked folder locked", async () => {
    const linked = await treeFolder(OPEN_BINDING_ID);
    const created = await client.post("/api/media/folders", {
      name: "Project A",
      parentId: linked.id,
    });
    expect(created.status).to.equal(HTTP_OK);
    const locked = await treeFolder(LOCKED_BINDING_ID);
    const refused = await client.post("/api/media/folders", {
      name: "Project A",
      parentId: locked.id,
    });
    expect(refused.status).to.equal(HTTP_FORBIDDEN);
    expect(refused.data).to.equal(`${ERRORS}.bound_parent`);
    const rename = await client.post(`/api/media/folders/${linked.id}/rename`, {
      name: "Renamed",
    });
    expect(rename.status).to.equal(HTTP_FORBIDDEN);
    const tree = await client.get("/api/media/tree");
    const subfolder = (tree.data.folders as FolderNode[]).find(
      (folder) => folder.id === created.data.id,
    );
    expect(subfolder?.acceptsSubfolders).to.equal(true);
    expect(subfolder?.accepts).to.deep.equal(["image/*"]);
  });

  it("applies the field's types to uploads into a subfolder", async () => {
    const linked = await treeFolder(OPEN_BINDING_ID);
    const created = await client.post("/api/media/folders", {
      name: "Project B",
      parentId: linked.id,
    });
    const nested = await client.post("/api/media/folders", {
      name: "Roof",
      parentId: created.data.id,
    });
    const presign = (filename: string, mimetype: string) =>
      client.post("/api/media/upload/presign", {
        folderId: nested.data.id,
        filename,
        size: 4,
        mimetype,
      });
    const text = await presign("notes.txt", "text/plain");
    expect(text.status).to.equal(HTTP_UNSUPPORTED_MEDIA_TYPE);
    expect(text.data.reason).to.equal("field_type");
    expect((await presign("photo.png", "image/png")).status).to.equal(HTTP_OK);
  });

  it("declares per-record folders under a linked folder that allows them", async () => {
    const linked = await treeFolder(OPEN_BINDING_ID);
    const project = await EnsureMediaFolder({
      tenantId: DEFAULT_TENANT_ID,
      key: "subfolders.project-c",
      name: "Project C",
      parent: { binding: OPEN_BINDING_ID },
    });
    expect(project.status).to.equal("created");
    expect((await folders().get(project.id))?.parentId).to.equal(linked.id);
    const again = await EnsureMediaFolder({
      tenantId: DEFAULT_TENANT_ID,
      key: "subfolders.project-c",
      name: "Project C",
      parent: { binding: OPEN_BINDING_ID },
    });
    expect(again).to.deep.equal({ status: "kept", id: project.id });
    const nested = await EnsureMediaFolder({
      tenantId: DEFAULT_TENANT_ID,
      key: "subfolders.project-c.roof",
      name: "Roof",
      parent: { key: "subfolders.project-c" },
    });
    expect(nested.status).to.equal("created");
    const sameParent = await EnsureMediaFolder({
      tenantId: DEFAULT_TENANT_ID,
      key: "subfolders.project-c.roof",
      name: "Roof",
      parent: "subfolders.project-c",
    });
    expect(
      sameParent,
      "a declared parent named by its key alone is the same declaration",
    ).to.deep.equal({ status: "kept", id: nested.id });
    const photo = await ImportMediaAsset({
      tenantId: DEFAULT_TENANT_ID,
      key: "subfolders.project-c.roof.photo",
      folder: { key: "subfolders.project-c.roof" },
      name: "roof.png",
      mimetype: PNG_MIMETYPE,
      source: { bytes: ONE_PIXEL_PNG },
    });
    expect(photo.status).to.equal("created");
    const notes = await rejectionOf(
      ImportMediaAsset({
        tenantId: DEFAULT_TENANT_ID,
        key: "subfolders.project-c.roof.notes",
        folder: { key: "subfolders.project-c.roof" },
        name: "notes.txt",
        mimetype: "text/plain",
        source: { bytes: Buffer.from("notes") },
      }),
    );
    expect(notes.message).to.contain("only accepts image/*");
  });

  it("refuses a declared subfolder under a linked folder that does not allow them", async () => {
    const locked = await rejectionOf(
      EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
        key: "subfolders.locked-child",
        name: "Child",
        parent: { binding: LOCKED_BINDING_ID },
      }),
    );
    expect(locked.message)
      .to.contain("subfolders.locked-child")
      .and.contain("cannot hold subfolders");
    const unknown = await rejectionOf(
      EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
        key: "subfolders.unknown-child",
        name: "Child",
        parent: { binding: "subfolders.never-registered" },
      }),
    );
    expect(unknown.message).to.contain("no folder is bound");
  });
});
