import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { MediaAsset, MediaAssetModel } from "../../db";
import { MediaAssetsController } from "../../routes/media/assets";

const TENANT_A = "query-list-a";
const TENANT_B = "query-list-b";
const VISIBLE_FOLDER = "visible";
const HIDDEN_FOLDER = "hidden";
const LIST_LIMIT = 1000;
const ROW_COUNT = 10_000;

function asset(id: number, folderId: string): Partial<MediaAsset> {
  return {
    _id: String(id),
    folderId,
    name: `asset-${id}`,
    mimetype: "text/plain",
    size: 0,
    storageKey: `query-fixture/${id}`,
    visibility: "private",
    mediaRevision: `query-revision-${id}`,
    json_retiredFiles: "[]",
    createdBy: "query-test",
  };
}

describe("[integration] bounded media listing queries", () => {
  let model: MediaAssetModel;
  let otherModel: MediaAssetModel;

  before(async function () {
    this.timeout(40_000);
    model = GetModel(MediaAssetModel, TENANT_A);
    otherModel = GetModel(MediaAssetModel, TENANT_B);
    await model.insert(
      Array.from({ length: ROW_COUNT }, (_, id) => asset(id, VISIBLE_FOLDER)),
    );
    await model.insert([asset(ROW_COUNT, HIDDEN_FOLDER)]);
    await otherModel.insert([asset(ROW_COUNT + 1, VISIBLE_FOLDER)]);
  });

  after(async () => {
    await model.table.delete().run();
    await otherModel.table.delete().run();
  });

  it("returns the same prefix without transferring the remaining readable assets", async () => {
    const original = await model.getBy("folderId", VISIBLE_FOLDER);
    const limited = await model.listByFolders([VISIBLE_FOLDER], LIST_LIMIT + 1);
    expect(original).to.have.length(ROW_COUNT);
    expect(limited).to.deep.equal(original.slice(0, LIST_LIMIT + 1));
    expect(limited.every((row) => row instanceof MediaAsset)).to.equal(true);
  });

  it("keeps folder and tenant constraints before the limit", async () => {
    const rows = await model.listByFolders([HIDDEN_FOLDER], LIST_LIMIT);
    expect(rows.map((row) => row._id)).to.deep.equal([String(ROW_COUNT)]);
    const other = await otherModel.listByFolders([VISIBLE_FOLDER], LIST_LIMIT);
    expect(other.map((row) => row._id)).to.deep.equal([String(ROW_COUNT + 1)]);
    expect(await model.listByFolders([], LIST_LIMIT)).to.deep.equal([]);
  });

  it("preserves the multi-folder prefix", async () => {
    const folders = [VISIBLE_FOLDER, HIDDEN_FOLDER];
    const original = await model.getBy("folderId", ...folders);
    expect(await model.listByFolders(folders, LIST_LIMIT)).to.deep.equal(
      original.slice(0, LIST_LIMIT),
    );
  });

  for (const count of [0, LIST_LIMIT, LIST_LIMIT + 1]) {
    it(`preserves the endpoint truncation boundary at ${count} rows`, async () => {
      const controller = new MediaAssetsController();
      const rows = Array.from({ length: count }, (_, id) =>
        asset(id, VISIBLE_FOLDER),
      );
      const calls: number[] = [];
      Object.defineProperty(controller, "resolveContext", {
        value: async () => ({
          access: { readable: new Set([VISIBLE_FOLDER]) },
          foldersById: new Map(),
          assetModel: {
            listByFolders: async (folders: string[], limit: number) => {
              expect(folders).to.deep.equal([VISIBLE_FOLDER]);
              calls.push(limit);
              return rows.slice(0, limit);
            },
          },
        }),
      });
      const result = await controller.listAll();
      expect(result.assets).to.have.length(Math.min(count, LIST_LIMIT));
      expect(result.truncated).to.equal(count > LIST_LIMIT);
      expect(calls).to.deep.equal([LIST_LIMIT + 1]);
    });
  }
});
