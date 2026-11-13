import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { EnsureMediaFolder } from "@antelopejs/interface-dms-media";
import { expect } from "chai";
import { MediaDeclarationModel, MediaFolderModel } from "../../db";
import { declaredFolderId } from "../../declared/folders";

const KEY = "declared.race.reports";
const NAME = "Race reports";

function folderModel() {
  return GetModel(MediaFolderModel, DEFAULT_TENANT_ID);
}

function declarationModel() {
  return GetModel(MediaDeclarationModel, DEFAULT_TENANT_ID);
}

describe("[integration] media declared folders — two processes declaring one key", () => {
  const id = declaredFolderId(DEFAULT_TENANT_ID, KEY);

  after(async () => {
    await folderModel().delete(id);
    for (const record of await declarationModel().getBy("key", KEY))
      await declarationModel().delete(record._id);
  });

  it("keeps the folder another process inserted between this one's checks and its insert", async () => {
    await folderModel().insert({
      _id: id,
      name: NAME,
      path: [],
      visibility: "private",
    });

    const result = await EnsureMediaFolder({
      tenantId: DEFAULT_TENANT_ID,
      key: KEY,
      name: NAME,
    });

    expect(result).to.deep.equal({ status: "kept", id });
    const named = (await folderModel().getAll()).filter(
      (folder) => folder.name === NAME,
    );
    expect(named.map((folder) => folder._id)).to.deep.equal([id]);
    const records = await declarationModel().getBy("key", KEY);
    expect(records.map((record) => record.targetId)).to.deep.equal([id]);
  });
});
