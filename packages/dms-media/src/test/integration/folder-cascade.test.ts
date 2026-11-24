import { randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { FileExists } from "@antelopejs/interface-file-storage";
import { expect } from "chai";
import { deleteFolderAction } from "../../automation/actions/delete-folder";
import { MediaAssetModel, MediaFolderModel } from "../../db";
import { uploadStorageBytes } from "../../derivatives";
import { deleteFolderTree } from "../../routes/media/folders";
import { declaredFolder, newTenant, stepCtx } from "../helpers/automation";

const TENANT = "folder-cascade";
const TEST_TIMEOUT_MS = 20 * 1000;

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

describe("[integration] folder deletion cascade", function () {
  this.timeout(TEST_TIMEOUT_MS);
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

describe("[integration] folder deletion of a file already being deleted", function () {
  this.timeout(TEST_TIMEOUT_MS);

  it("finishes the cleanup of a tombstoned file and counts only the files it deleted", async () => {
    const tenantId = await newTenant();
    const folderId = await declaredFolder(tenantId, "half-deleted");
    const assets = GetModel(MediaAssetModel, tenantId);
    const live = await insertAsset(assets, folderId);
    const storageKey = await uploadStorageBytes(
      Buffer.from("tombstoned"),
      "tombstoned.txt",
      "text/plain",
      randomUUID(),
      undefined,
    );
    const tombstoned = randomUUID();
    await assets.insert({
      _id: tombstoned,
      folderId,
      name: "tombstoned.txt",
      mimetype: "text/plain",
      size: 10,
      storageKey,
      createdBy: "test",
      visibility: "inherit",
      isDeleting: true,
      mediaRevision: randomUUID(),
      json_retiredFiles: JSON.stringify([storageKey]),
    });

    const deleted = await deleteFolderAction.execute(
      { tenantId, folderId },
      stepCtx(),
    );

    expect(deleted).to.deep.include({ deletedFiles: 1, deletedFolders: 1 });
    expect(await assets.get(live)).to.equal(undefined);
    expect(await assets.get(tombstoned)).to.equal(undefined);
    expect(await FileExists(storageKey)).to.equal(false);
  });
});
