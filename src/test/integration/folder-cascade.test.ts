import { randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { MediaAssetModel, MediaFolderModel } from "../../db";
import { uploadStorageBytes } from "../../derivatives";
import { deleteFolderTree } from "../../routes/media/folders";

const TENANT = "folder-cascade";

async function insertFolder(
  model: MediaFolderModel,
  _id: string,
  parentId?: string,
): Promise<void> {
  await model.insert({
    _id,
    name: _id,
    parentId,
    path: [],
    visibility: "private",
  });
}

async function insertAsset(
  model: MediaAssetModel,
  folderId: string,
): Promise<string> {
  const _id = randomUUID();
  await model.insert({
    _id,
    folderId,
    name: "asset.txt",
    mimetype: "text/plain",
    size: 7,
    storageKey: await uploadStorageBytes(
      Buffer.from("cascade"),
      "asset.txt",
      "text/plain",
      randomUUID(),
      undefined,
    ),
    createdBy: "test",
    visibility: "inherit",
    mediaRevision: randomUUID(),
    json_retiredFiles: "[]",
  });
  return _id;
}

describe("[integration] folder deletion cascade", () => {
  let folderModel: MediaFolderModel;
  let assetModel: MediaAssetModel;

  before(() => {
    folderModel = GetModel(MediaFolderModel, TENANT);
    assetModel = GetModel(MediaAssetModel, TENANT);
  });

  afterEach(async () => {
    await folderModel.table.delete().run();
    await assetModel.table.delete().run();
  });

  it("removes children and assets written after the request snapshot", async () => {
    await insertFolder(folderModel, "root");
    await insertFolder(folderModel, "known", "root");
    await insertFolder(folderModel, "late", "known");
    await insertFolder(folderModel, "late-grandchild", "late");
    await insertFolder(folderModel, "kept");
    await insertAsset(assetModel, "root");
    await insertAsset(assetModel, "late-grandchild");
    const keptAsset = await insertAsset(assetModel, "kept");

    await deleteFolderTree({ folderModel, assetModel }, ["root", "known"]);

    const folders = await folderModel.getAll();
    expect(folders.map((folder) => folder._id)).to.deep.equal(["kept"]);
    const assets = await assetModel.getAll();
    expect(assets.map((asset) => asset._id)).to.deep.equal([keptAsset]);
  });
});
