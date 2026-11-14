import { GetModel } from "@antelopejs/interface-database-decorators";
import { Schema } from "@antelopejs/interface-database";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { expect } from "chai";
import {
  addAssetBinding,
  bindingFolderId,
  CONTENT_ROOT_BINDING,
  ensureTenantBindings,
  removeAssetBinding,
} from "../../bindings";
import { type MediaFolder, MediaFolderModel } from "../../db";

const TENANT_ID = "binding-folder-race";
const BINDING = "race.cover";
const READ_PERMISSION = "race.cover.read";

/** A folder model whose `getAll` answers as it did before another process wrote. */
class StaleReadFolderModel extends MediaFolderModel {
  override getAll(): Promise<MediaFolder[]> {
    return Promise.resolve([]);
  }
}

describe("[integration] media bindings — two processes provisioning one tenant", () => {
  before(async () => {
    const schema = Schema.get(TENANT_SCHEMA_NAME);
    if (!schema) throw new Error("Tenant schema is missing");
    await schema.createInstance(TENANT_ID).run();
  });

  after(() => removeAssetBinding(BINDING));

  it("keeps the content root and linked folder another process inserted after this one read, and applies the binding ACL", async () => {
    const folders = GetModel(MediaFolderModel, TENANT_ID);
    const rootId = bindingFolderId(TENANT_ID, CONTENT_ROOT_BINDING);
    const folderId = bindingFolderId(TENANT_ID, BINDING);
    await folders.insert({
      _id: rootId,
      name: "Content",
      path: [],
      binding: CONTENT_ROOT_BINDING,
      json_acl: "[]",
      visibility: "private",
    });
    await folders.insert({
      _id: folderId,
      name: "Race covers",
      parentId: rootId,
      path: [rootId],
      binding: BINDING,
      json_acl: "[]",
      visibility: "private",
    });

    addAssetBinding(BINDING, {
      id: BINDING,
      folderName: "Race covers",
      permissionMapping: { read: [READ_PERMISSION] },
    });
    await ensureTenantBindings(
      TENANT_ID,
      GetModel(StaleReadFolderModel, TENANT_ID),
    );

    const stored = await folders.getAll();
    const idsOf = (binding: string) =>
      stored
        .filter((folder) => folder.binding === binding)
        .map((folder) => folder._id);
    expect(idsOf(CONTENT_ROOT_BINDING)).to.deep.equal([rootId]);
    expect(idsOf(BINDING)).to.deep.equal([folderId]);
    expect((await folders.get(folderId))?.json_acl).to.equal(
      JSON.stringify([
        {
          subject: { kind: "permission", id: READ_PERMISSION },
          rights: ["read"],
        },
      ]),
    );
  });
});
