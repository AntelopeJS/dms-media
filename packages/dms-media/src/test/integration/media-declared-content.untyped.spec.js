import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  EnsureMediaFolder,
  ImportMediaAsset,
} from "@antelopejs/interface-dms-media";
import { assert, expect } from "chai";
import {
  MediaAssetModel,
  MediaDeclarationModel,
  MediaEventModel,
  MediaFolderModel,
} from "../../db";
import { ONE_PIXEL_PNG, PNG_MIMETYPE } from "../helpers/assets";

const FOLDER_KEY = "declared.untyped";

function models() {
  return {
    folders: GetModel(MediaFolderModel, DEFAULT_TENANT_ID),
    assets: GetModel(MediaAssetModel, DEFAULT_TENANT_ID),
    declarations: GetModel(MediaDeclarationModel, DEFAULT_TENANT_ID),
    events: GetModel(MediaEventModel, DEFAULT_TENANT_ID),
  };
}

async function snapshot() {
  const { folders, assets, declarations, events } = models();
  return {
    folders: await folders.getAll(),
    assets: await assets.getAll(),
    declarations: await declarations.getAll(),
    events: await events.getAll(),
  };
}

async function rejectionOf(promise) {
  try {
    await promise;
  } catch (error) {
    assert.instanceOf(error, Error);
    return error;
  }
  throw new Error("Expected the declaration to be refused");
}

describe("[integration] media declared content — untyped callers", () => {
  it("rejects a missing tenant before changing the default library", async () => {
    const before = await snapshot();
    const folder = { key: "declared.untyped-tenant", name: "No tenant" };
    const file = {
      key: "declared.untyped-tenant-file",
      folder: { key: FOLDER_KEY },
      name: "no-tenant.png",
      mimetype: PNG_MIMETYPE,
      source: { bytes: ONE_PIXEL_PNG },
    };
    expect((await rejectionOf(EnsureMediaFolder(folder))).message).to.contain(
      "tenantId",
    );
    expect((await rejectionOf(ImportMediaAsset(file))).message).to.contain(
      "tenantId",
    );
    expect(await snapshot()).to.deep.equal(before);
  });

  describe("a lazy source", () => {
    let folderId = "";

    before(async () => {
      const declared = await EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
        key: FOLDER_KEY,
        name: "Untyped callers",
      });
      folderId = declared.id;
    });

    after(async () => {
      const { folders, declarations } = models();
      await folders.delete(folderId);
      for (const record of await declarations.getBy("key", FOLDER_KEY))
        await declarations.delete(record._id);
    });

    it("names the key when it returns something other than bytes", async () => {
      const wrong = await rejectionOf(
        ImportMediaAsset({
          tenantId: DEFAULT_TENANT_ID,
          key: "declared.untyped-lazy-wrong",
          folder: { key: FOLDER_KEY },
          name: "lazy.txt",
          mimetype: "text/plain",
          source: { load: () => "text" },
        }),
      );
      expect(wrong.message)
        .to.contain("declared.untyped-lazy-wrong")
        .and.contain("must return a Uint8Array");
    });
  });
});
