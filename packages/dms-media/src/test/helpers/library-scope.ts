import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { getRegisteredBindings, removeAssetBinding } from "../../bindings";
import {
  MediaAssetModel,
  MediaDeclarationModel,
  MediaFolderModel,
} from "../../db";

const CLEANUP_TIMEOUT_MS = 30_000;

interface Snapshot {
  bindings: Set<string>;
  folders: Set<string>;
  assets: Set<string>;
  declarations: Set<string>;
}

async function takeSnapshot(): Promise<Snapshot> {
  const [folders, assets, declarations] = await Promise.all([
    GetModel(MediaFolderModel, DEFAULT_TENANT_ID).getAll(),
    GetModel(MediaAssetModel, DEFAULT_TENANT_ID).getAll(),
    GetModel(MediaDeclarationModel, DEFAULT_TENANT_ID).getAll(),
  ]);
  return {
    bindings: new Set(getRegisteredBindings().map((config) => config.id)),
    folders: new Set(folders.map((folder) => folder._id)),
    assets: new Set(assets.map((asset) => asset._id)),
    declarations: new Set(declarations.map((record) => record._id)),
  };
}

async function removeSince(before: Snapshot): Promise<void> {
  for (const { id } of getRegisteredBindings()) {
    if (!before.bindings.has(id)) removeAssetBinding(id);
  }
  const folderModel = GetModel(MediaFolderModel, DEFAULT_TENANT_ID);
  const assetModel = GetModel(MediaAssetModel, DEFAULT_TENANT_ID);
  const declarationModel = GetModel(MediaDeclarationModel, DEFAULT_TENANT_ID);
  const [folders, assets, declarations] = await Promise.all([
    folderModel.getAll(),
    assetModel.getAll(),
    declarationModel.getAll(),
  ]);
  await Promise.all([
    ...assets
      .filter((asset) => !before.assets.has(asset._id))
      .map((asset) => assetModel.delete(asset._id)),
    ...folders
      .filter((folder) => !before.folders.has(folder._id))
      .map((folder) => folderModel.delete(folder._id)),
    ...declarations
      .filter((record) => !before.declarations.has(record._id))
      .map((record) => declarationModel.delete(record._id)),
  ]);
}

/**
 * Leaves the library as the suite found it. Call once at the top of a
 * describe: its `before` records the folders, files, declaration records and
 * asset bindings that exist, and its `after` removes the ones added since, so
 * a later suite meets the library it expects. Stored bytes stay in the file
 * storage.
 */
export function leaveLibraryAsFound(): void {
  let found: Snapshot;

  before(async function () {
    this.timeout(CLEANUP_TIMEOUT_MS);
    found = await takeSnapshot();
  });

  after(async function () {
    this.timeout(CLEANUP_TIMEOUT_MS);
    await removeSince(found);
  });
}
