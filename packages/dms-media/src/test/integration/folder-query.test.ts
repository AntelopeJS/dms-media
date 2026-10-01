import { Query } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { MediaFolder, MediaFolderModel } from "../../db";

type RunQuery = (this: Query<unknown>) => Promise<unknown>;
const TENANT = "folder-query-a";
const OTHER = "folder-query-b";

describe("[integration] folder query pushdown", () => {
  let model: MediaFolderModel;
  let other: MediaFolderModel;

  before(async () => {
    model = GetModel(MediaFolderModel, TENANT);
    other = GetModel(MediaFolderModel, OTHER);
    await model.insert([
      { _id: "folder-root", name: "root", path: [], visibility: "private" },
      {
        _id: "folder-child",
        name: "child",
        path: ["folder-root"],
        binding: "shared",
        visibility: "private",
      },
      {
        _id: "folder-grandchild",
        name: "grandchild",
        path: ["folder-root", "folder-child"],
        binding: "shared",
        visibility: "private",
      },
      {
        _id: "folder-sibling",
        name: "sibling",
        path: ["folder-root-suffix"],
        visibility: "private",
      },
    ]);
    await other.insert([
      {
        _id: "folder-other",
        name: "other",
        path: ["folder-root"],
        visibility: "private",
      },
    ]);
  });

  after(async () => {
    await model.table.delete().run();
    await other.table.delete().run();
  });

  it("selects exact ancestor membership within the tenant and retains hydration", async () => {
    const expected = (await model.getAll()).filter((row) =>
      row.path.includes("folder-root"),
    );
    const result = await model.getDescendants("folder-root");
    expect(result).to.deep.equal(expected);
    expect(result.map((row) => row._id)).to.deep.equal([
      "folder-child",
      "folder-grandchild",
    ]);
    expect(result.every((row) => row instanceof MediaFolder)).to.equal(true);
    expect(await model.getDescendants("missing")).to.deep.equal([]);
    expect(
      (await other.getDescendants("folder-root")).map((row) => row._id),
    ).to.deep.equal(["folder-other"]);
  });

  it("limits a binding lookup before transfer and keeps the existing first match", async () => {
    const expected = (await model.getBy("binding", "shared"))[0];
    const original = Object.getOwnPropertyDescriptor(Query.prototype, "run")!;
    const run = original.value as RunQuery;
    const stages: string[][] = [];
    Object.defineProperty(Query.prototype, "run", {
      ...original,
      value: function (this: Query<unknown>) {
        stages.push(this.stages.slice(3).map((stage) => stage.stage));
        return run.call(this);
      },
    });
    try {
      expect(await model.getByBinding("shared")).to.deep.equal(expected);
      expect(await model.getByBinding("missing")).to.equal(undefined);
      expect(stages).to.deep.equal([
        ["getAll", "slice"],
        ["getAll", "slice"],
      ]);
    } finally {
      Object.defineProperty(Query.prototype, "run", original);
    }
  });
});
