import { randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  EnsureMediaFolder,
  ImportMediaAsset,
} from "@antelopejs/interface-dms-media";
import { FileExists } from "@antelopejs/interface-file-storage";
import { expect } from "chai";
import {
  MediaAssetModel,
  MediaDeclarationModel,
  MediaEventModel,
  MediaFolderModel,
} from "../../db";
import { uploadStorageBytes } from "../../derivatives";
import { ONE_PIXEL_PNG, PNG_MIMETYPE } from "../helpers/assets";
import { patchMethod } from "../helpers/prototype";

const KEY = "declared.race.logo";
const FOLDER_KEY = "declared.race.assets";
const NAME = "race-logo.png";

function assetModel() {
  return GetModel(MediaAssetModel, DEFAULT_TENANT_ID);
}

function declarationModel() {
  return GetModel(MediaDeclarationModel, DEFAULT_TENANT_ID);
}

/**
 * Lets another process importing the same key insert its asset, pointing at
 * `winnerKey`, just before this process's own insert runs.
 */
function insertAnotherProcessFirst(
  winnerKey: string,
  loserKeys: string[],
): () => void {
  const restore = patchMethod<MediaAssetModel, "insert">(
    MediaAssetModel.prototype,
    "insert",
    (original) =>
      async function (this: MediaAssetModel, obj, options) {
        restore();
        if (Array.isArray(obj) || obj.storageKey === undefined)
          throw new Error("Expected one asset insert from the import");
        loserKeys.push(obj.storageKey);
        await original.call(this, { ...obj, storageKey: winnerKey }, options);
        return original.call(this, obj, options);
      },
  );
  return restore;
}

describe("[integration] media declared assets — two processes importing one key", () => {
  let restoreInsert: (() => void) | undefined;
  let folderId: string | undefined;

  after(async () => {
    restoreInsert?.();
    if (folderId) {
      for (const asset of await assetModel().getBy("folderId", folderId))
        await assetModel().delete(asset._id);
      await GetModel(MediaFolderModel, DEFAULT_TENANT_ID).delete(folderId);
    }
    for (const key of [KEY, FOLDER_KEY])
      for (const record of await declarationModel().getBy("key", key))
        await declarationModel().delete(record._id);
  });

  it("keeps the asset another process inserted between this one's checks and its insert", async () => {
    folderId = (
      await EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
        key: FOLDER_KEY,
        name: "Race assets",
      })
    ).id;
    const winnerKey = await uploadStorageBytes(
      ONE_PIXEL_PNG,
      NAME,
      PNG_MIMETYPE,
      `media/${DEFAULT_TENANT_ID}/${folderId}/${randomUUID()}`,
      undefined,
    );
    const loserKeys: string[] = [];
    restoreInsert = insertAnotherProcessFirst(winnerKey, loserKeys);

    const result = await ImportMediaAsset({
      tenantId: DEFAULT_TENANT_ID,
      key: KEY,
      folder: { key: FOLDER_KEY },
      name: NAME,
      mimetype: PNG_MIMETYPE,
      source: { bytes: ONE_PIXEL_PNG },
    });

    const stored = await assetModel().getBy("folderId", folderId);
    expect(stored.map((asset) => asset.storageKey)).to.deep.equal([winnerKey]);
    expect(result).to.deep.equal({ status: "kept", id: stored[0]?._id });
    const records = await declarationModel().getBy("key", KEY);
    expect(records.map((record) => record.targetId)).to.deep.equal([
      stored[0]?._id,
    ]);
    expect(loserKeys).to.have.length(1);
    expect(await FileExists(loserKeys[0] ?? "")).to.equal(false);
    expect(await FileExists(winnerKey)).to.equal(true);
    const events = await GetModel(
      MediaEventModel,
      DEFAULT_TENANT_ID,
    ).listByAsset(stored[0]?._id ?? "");
    expect(events.map((event) => event.kind)).to.deep.equal([]);
  });
});
