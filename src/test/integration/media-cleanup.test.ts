import { randomUUID } from "node:crypto";
import {
  type AtomicMutation,
  type AtomicMutationOutcome,
  Query,
  Table,
} from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import * as storage from "@antelopejs/interface-file-storage";
import { expect } from "chai";
import sharp from "sharp";
import {
  cleanupAssetFiles,
  deleteMediaAsset,
  retiredFiles,
  updateAssetMedia,
} from "../../asset-lifecycle";
import { getMediaConfig } from "../../config";
import { sweepAssetDerivatives } from "../../crons/sweep-derivatives";
import { type MediaAsset, MediaAssetModel } from "../../db";
import { commitDerivative, uploadStorageBytes } from "../../derivatives";
import { presetCacheKey } from "../../presets";
import { parseDerivatives } from "../../routes/media/storage-keys";
import { applyImageTransform } from "../../transform";

const TENANT = "media-cleanup-concurrency";
const OLD_DATE = new Date("2020-01-01T00:00:00Z");
type AtomicMediaMutation = (
  this: Table<MediaAsset>,
  key: string,
  request: AtomicMutation<MediaAsset>,
) => Query<AtomicMutationOutcome>;

function upload(): Promise<string> {
  return uploadStorageBytes(
    Buffer.from("cleanup"),
    "file.txt",
    "text/plain",
    randomUUID(),
    undefined,
  );
}

async function uploadImage(): Promise<string> {
  const bytes = await sharp({
    create: { width: 20, height: 10, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  return uploadStorageBytes(
    bytes,
    "image.png",
    "image/png",
    randomUUID(),
    undefined,
  );
}

async function insertAsset(model: MediaAssetModel): Promise<MediaAsset> {
  const _id = randomUUID();
  await model.insert({
    _id,
    folderId: "folder",
    name: "asset",
    mimetype: "text/plain",
    size: 7,
    storageKey: await upload(),
    createdBy: "test",
    visibility: "private",
    mediaRevision: randomUUID(),
    json_retiredFiles: "[]",
  });
  await model.table.get(_id).update({ updatedAt: OLD_DATE }).run();
  return (await model.get(_id))!;
}

describe("[integration] replayable media cleanup", () => {
  let model: MediaAssetModel;
  let asset: MediaAsset;
  let compare: MediaAssetModel["compareMedia"];
  let atomicMutation: PropertyDescriptor;

  beforeEach(async () => {
    model = GetModel(MediaAssetModel, TENANT);
    asset = await insertAsset(model);
    compare = model.compareMedia.bind(model);
    atomicMutation = Object.getOwnPropertyDescriptor(
      Table.prototype,
      "atomicMutation",
    )!;
  });

  afterEach(async () => {
    model.compareMedia = compare;
    Object.defineProperty(Table.prototype, "atomicMutation", atomicMutation);
    await deleteMediaAsset(model, asset._id);
  });

  it("allows exactly one competing revision and keeps creation/update modifiers", async () => {
    const patches = [{ alt: "first" }, { alt: "second" }];
    const results = await Promise.all(
      patches.map((patch) => model.compareMedia(asset, patch)),
    );
    expect(results.filter(Boolean)).to.have.length(1);
    const winner = (await model.get(asset._id))!;
    expect(winner.alt).to.equal(patches[results.indexOf(true)].alt);
    expect(winner.createdAt).to.deep.equal(asset.createdAt);
    expect(winner.updatedAt.getTime()).to.be.greaterThan(OLD_DATE.getTime());
    expect(await model.compareMedia(asset, { alt: "stale" })).to.equal(false);
    expect(await model.get(asset._id)).to.deep.equal(winner);
  });

  it("merges competing publications instead of losing either preset", async () => {
    const keys = await Promise.all([upload(), upload()]);
    const results = await Promise.all(
      keys.map((key, index) =>
        commitDerivative(model, asset, `preset-${index}`, key),
      ),
    );
    expect(results).to.deep.equal(keys);
    expect(parseDerivatives((await model.get(asset._id))!)).to.deep.equal({
      "preset-0": keys[0],
      "preset-1": keys[1],
    });
    expect(
      await Promise.all(keys.map((key) => storage.FileExists(key))),
    ).to.deep.equal([true, true]);
  });

  it("reuses the winning publication and never deletes it on replay", async () => {
    const keys = await Promise.all([upload(), upload()]);
    const results = await Promise.all(
      keys.map((key) => commitDerivative(model, asset, "same", key)),
    );
    expect(new Set(results).size).to.equal(1);
    const winner = results[0]!;
    expect(await commitDerivative(model, asset, "same", winner)).to.equal(
      winner,
    );
    expect(await storage.FileExists(winner)).to.equal(true);
    expect(
      await storage.FileExists(keys.find((key) => key !== winner)!),
    ).to.equal(false);
  });

  it("does not delete a key shared by a fresh and stale derivative", async () => {
    const key = await upload();
    const cacheKey = presetCacheKey([...getMediaConfig().presets.values()][0]);
    await updateAssetMedia(model, asset, {
      json_derivatives: JSON.stringify({ obsolete: key, [cacheKey]: key }),
    });
    await sweepAssetDerivatives(model, asset);
    expect(parseDerivatives((await model.get(asset._id))!)).to.deep.equal({
      [cacheKey]: key,
    });
    expect(await storage.FileExists(key)).to.equal(true);
  });

  it("stops on unknown write acknowledgement and replays durable cleanup later", async () => {
    const key = await upload();
    await commitDerivative(model, asset, "obsolete", key);
    let calls = 0;
    const original = atomicMutation.value as AtomicMediaMutation;
    Object.defineProperty(Table.prototype, "atomicMutation", {
      ...atomicMutation,
      value: function (
        this: Table<MediaAsset>,
        id: string,
        request: AtomicMutation<MediaAsset>,
      ) {
        const query = original.call(this, id, request);
        const run = query.run.bind(query);
        query.run = async () => {
          calls++;
          await run();
          return "unknown";
        };
        return query;
      },
    });
    const error = await sweepAssetDerivatives(model, asset).catch(
      (failure: unknown) => failure,
    );
    expect(error).to.be.instanceOf(Error);
    expect(calls).to.equal(1);
    expect(await storage.FileExists(key)).to.equal(true);
    expect(retiredFiles((await model.get(asset._id))!)).to.deep.equal([key]);
    Object.defineProperty(Table.prototype, "atomicMutation", atomicMutation);
    await sweepAssetDerivatives(model, asset);
    expect(await storage.FileExists(key)).to.equal(false);
  });

  it("rechecks a stale sweep snapshot after a concurrent publication", async () => {
    const [oldKey, newKey] = await Promise.all([upload(), upload()]);
    await commitDerivative(model, asset, "obsolete", oldKey);
    const preset = [...getMediaConfig().presets.values()][0];
    const cacheKey = presetCacheKey(preset);
    let injected = false;
    model.compareMedia = async (expected, patch) => {
      if (!injected) {
        injected = true;
        await commitDerivative(model, asset, cacheKey, newKey);
      }
      return compare.call(model, expected, patch);
    };
    await Promise.all([
      sweepAssetDerivatives(model, asset),
      sweepAssetDerivatives(model, asset),
    ]);
    expect(injected).to.equal(true);
    expect(parseDerivatives((await model.get(asset._id))!)).to.deep.equal({
      [cacheKey]: newKey,
    });
    expect(await storage.FileExists(oldKey)).to.equal(false);
    expect(await storage.FileExists(newKey)).to.equal(true);
  });

  it("retries only unfinished work after partial storage failure", async () => {
    const [first, second] = await Promise.all([upload(), upload()]);
    await commitDerivative(model, asset, "old-first", first);
    await commitDerivative(model, asset, "old-second", second);
    await updateAssetMedia(model, (await model.get(asset._id))!, {
      json_derivatives: "",
    });
    await cleanupAssetFiles(model, asset._id, async (key, storageName) => {
      if (key === second) throw new Error("storage unavailable");
      return storage.DeleteFile(key, storageName);
    });
    const partial = (await model.get(asset._id))!;
    expect(parseDerivatives(partial)).to.deep.equal({});
    expect(retiredFiles(partial)).to.deep.equal([second]);
    expect(await storage.FileExists(first)).to.equal(false);
    expect(await storage.FileExists(second)).to.equal(true);
    await sweepAssetDerivatives(model, asset);
    expect(retiredFiles((await model.get(asset._id))!)).to.deep.equal([]);
    expect(await storage.FileExists(second)).to.equal(false);
  });

  it("replays a deletion whose acknowledgement failed without losing the queue", async () => {
    const key = await upload();
    await commitDerivative(model, asset, "obsolete", key);
    model.compareMedia = async (expected, patch) => {
      if (patch.json_retiredFiles === "[]")
        throw new Error("acknowledgement failed");
      return compare.call(model, expected, patch);
    };
    const error = await sweepAssetDerivatives(model, asset).catch(
      (failure: unknown) => failure,
    );
    expect(error).to.be.instanceOf(Error);
    expect(await storage.FileExists(key)).to.equal(false);
    expect(retiredFiles((await model.get(asset._id))!)).to.deep.equal([key]);
    model.compareMedia = compare;
    await cleanupAssetFiles(model, asset._id);
    expect(retiredFiles((await model.get(asset._id))!)).to.deep.equal([]);
  });

  it("tombstones before external deletion and rejects late publication", async () => {
    await deleteMediaAsset(model, asset._id, async () => {
      throw new Error("storage unavailable");
    });
    const deleted = (await model.get(asset._id))!;
    expect(deleted.isDeleting).to.equal(true);
    expect(retiredFiles(deleted)).to.deep.equal([asset.storageKey]);
    expect(await model.listByFolders([asset.folderId], 1)).to.deep.equal([]);
    expect(await model.getByFolder(asset.folderId)).to.deep.equal([]);
    const lateKey = await upload();
    expect(await commitDerivative(model, asset, "late", lateKey)).to.equal(
      undefined,
    );
    expect(await storage.FileExists(lateKey)).to.equal(false);
    await cleanupAssetFiles(model, asset._id);
    expect(await model.get(asset._id)).to.equal(undefined);
    expect(await model.compareMedia(asset, { alt: "resurrect" })).to.equal(
      false,
    );
  });

  it("rejects generated bytes from a replaced source without harming its replacement", async () => {
    const [replacement, obsolete] = await Promise.all([upload(), upload()]);
    expect(
      await updateAssetMedia(model, asset, { storageKey: replacement }),
    ).to.equal(true);
    expect(await commitDerivative(model, asset, "obsolete", obsolete)).to.equal(
      undefined,
    );
    await cleanupAssetFiles(model, asset._id);
    expect(await storage.FileExists(obsolete)).to.equal(false);
    expect(await storage.FileExists(asset.storageKey)).to.equal(false);
    expect(await storage.FileExists(replacement)).to.equal(true);
    expect(parseDerivatives((await model.get(asset._id))!)).to.deep.equal({});
  });

  it("retires derivatives published during a transform without deleting the original", async () => {
    const source = await uploadImage();
    await updateAssetMedia(model, asset, {
      storageKey: source,
      mimetype: "image/png",
    });
    asset = (await model.get(asset._id))!;
    const derivative = await upload();
    let injected = false;
    model.compareMedia = async (expected, patch) => {
      if (!injected) {
        injected = true;
        await commitDerivative(model, asset, "during-transform", derivative);
      }
      return compare.call(model, expected, patch);
    };
    await applyImageTransform(model, asset, { rotate: 90 });
    const transformed = (await model.get(asset._id))!;
    expect(transformed.width).to.equal(10);
    expect(transformed.height).to.equal(20);
    expect(transformed.originalKey).to.equal(source);
    expect(parseDerivatives(transformed)).to.deep.equal({});
    expect(await storage.FileExists(source)).to.equal(true);
    expect(await storage.FileExists(derivative)).to.equal(false);
    expect(await storage.FileExists(transformed.storageKey)).to.equal(true);
  });
});
