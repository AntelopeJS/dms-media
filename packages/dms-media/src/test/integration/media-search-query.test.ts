import { Query } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { type MediaAsset, MediaAssetModel } from "../../db";
import { MediaAssetsController } from "../../routes/media/assets";
import { patchMethod } from "../helpers/prototype";

const TENANT = "stream-search-a";
const OTHER_TENANT = "stream-search-b";
const FOLDER = "readable";
const HIDDEN = "hidden";
const SKIPPED = 150;
const MATCHING = 120;
const LIMIT = 100;

function asset(
  id: string,
  name: string,
  folderId = FOLDER,
): Partial<MediaAsset> {
  return {
    _id: id,
    name,
    folderId,
    mimetype: "image/png",
    size: 0,
    storageKey: `search/${id}`,
    visibility: "private",
    mediaRevision: `search-revision-${id}`,
    json_retiredFiles: "[]",
    createdBy: "test",
  };
}

function controller(
  model: MediaAssetModel,
  folders = [FOLDER],
): MediaAssetsController {
  const result = new MediaAssetsController();
  Object.defineProperty(result, "resolveContext", {
    value: async () => ({
      assetModel: model,
      access: { readable: new Set(folders) },
      foldersById: new Map(),
    }),
  });
  return result;
}

describe("[integration] streaming asset search", () => {
  let model: MediaAssetModel;
  let other: MediaAssetModel;

  before(async () => {
    model = GetModel(MediaAssetModel, TENANT);
    other = GetModel(MediaAssetModel, OTHER_TENANT);
    await model.insert([
      asset("hidden", "İmage", HIDDEN),
      ...Array.from({ length: SKIPPED }, (_, id) =>
        asset(`skip-${id}`, "unrelated"),
      ),
      ...Array.from({ length: MATCHING }, (_, id) =>
        asset(`match-${id}`, "İmage"),
      ),
    ]);
    await other.insert([asset("other", "İmage")]);
  });

  after(async () => {
    await model.table.delete().run();
    await other.table.delete().run();
  });

  it("preserves Unicode matching and scoped prefix, stopping and closing after 100 matches", async () => {
    const candidates = await model.getBy("folderId", FOLDER);
    const expected = candidates
      .filter((row) => row.name.toLowerCase().includes("İ".toLowerCase()))
      .slice(0, LIMIT);
    let consumed = 0;
    let closed = false;
    const restore = patchMethod<Query<unknown>, "cursor">(
      Query.prototype,
      "cursor",
      (readCursor) =>
        async function* (this: Query<unknown>) {
          try {
            for await (const row of readCursor.call(this)) {
              consumed++;
              yield row;
            }
          } finally {
            closed = true;
          }
        },
    );
    try {
      const result = await controller(model).search(" İ ", " IMAGE/ ");
      expect(result.assets.map((row) => row.id)).to.deep.equal(
        expected.map((row) => row._id),
      );
      expect(consumed).to.equal(SKIPPED + LIMIT);
      expect(consumed).to.be.lessThan(candidates.length);
      expect(closed).to.equal(true);
    } finally {
      restore();
    }
  });

  it("retains empty and non-matching searches", async () => {
    expect((await controller(model).search()).assets).to.have.length(LIMIT);
    expect((await controller(model).search("absent")).assets).to.deep.equal([]);
    expect((await controller(model).search("", "text/")).assets).to.deep.equal(
      [],
    );
    expect((await controller(model, []).search()).assets).to.deep.equal([]);
    expect(
      (await controller(other).search("İ")).assets.map((row) => row.id),
    ).to.deep.equal(["other"]);
  });
});
