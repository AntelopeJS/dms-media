import { Query } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { runSweepStaleDerivatives } from "../../crons/sweep-derivatives";
import { type MediaAsset, MediaAssetModel } from "../../db";

const TENANTS = ["stream-sweep-a", "stream-sweep-b"];
type CursorFactory = (this: Query<unknown>) => AsyncIterable<unknown>;

describe("[integration] streaming derivative sweep", () => {
  it("visits each scoped asset cursor and retains per-asset updates", async () => {
    const models = TENANTS.map((id) => GetModel(MediaAssetModel, id));
    const fixture: Partial<MediaAsset> = {
      _id: "asset",
      folderId: "folder",
      name: "asset",
      mimetype: "image/png",
      size: 0,
      storageKey: "sweep/asset",
      createdBy: "test",
      mediaRevision: "sweep-revision",
      json_retiredFiles: "[]",
      visibility: "private",
      json_derivatives: JSON.stringify({
        obsolete: "sweep/nonexistent-stale-file",
      }),
    };
    for (const [index, model] of models.entries()) {
      await model.insert([{ ...fixture, _id: TENANTS[index] }]);
    }
    const original = Object.getOwnPropertyDescriptor(
      Query.prototype,
      "cursor",
    )!;
    const readCursor = original.value as CursorFactory;
    const visits: string[] = [];
    Object.defineProperty(Query.prototype, "cursor", {
      ...original,
      value: async function* (this: Query<unknown>) {
        const table = this.stages.find((stage) => stage.stage === "table")
          ?.options?.id;
        if (table === "tenants") {
          for (const _id of TENANTS) yield { _id };
          return;
        }
        visits.push(
          this.stages.find((stage) => stage.stage === "instance")?.options?.id,
        );
        yield* readCursor.call(this);
      },
    });
    try {
      await runSweepStaleDerivatives();
      expect(visits).to.deep.equal(TENANTS);
      for (const [index, model] of models.entries()) {
        expect((await model.get(TENANTS[index]))?.json_derivatives).to.equal(
          "",
        );
      }
    } finally {
      Object.defineProperty(Query.prototype, "cursor", original);
      for (const model of models) await model.table.delete().run();
    }
  });
});
