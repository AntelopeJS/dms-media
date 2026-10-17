import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { triggerEvent } from "@antelopejs/interface-database-decorators/modifiers/common";
import { MEDIA_FOLDERS_TABLE_NAME, MediaFolder } from "../tables";

export class MediaFolderModel extends BasicDataModel(
  MediaFolder,
  MEDIA_FOLDERS_TABLE_NAME,
) {
  /** Applies a declaration only while the observed editable state and path still match. */
  async compareDeclared(
    expected: MediaFolder,
    patch: Partial<MediaFolder>,
  ): Promise<boolean> {
    const instance = MediaFolderModel.fromPlainData(patch);
    triggerEvent(instance, "update");
    const count = await this.table
      .filter((row) =>
        row
          .key("_id")
          .eq(expected._id)
          .and(row.key("name").eq(expected.name))
          .and(
            row
              .key("parentId")
              .default("")
              .eq(expected.parentId || ""),
          )
          .and(row.key("path").eq(expected.path))
          .and(row.key("visibility").eq(expected.visibility))
          .and(
            row
              .key("json_acl")
              .default("")
              .eq(expected.json_acl || ""),
          ),
      )
      .update(MediaFolderModel.toDatabase(instance))
      .run();
    return count === 1;
  }

  async getChildren(parentId: string): Promise<MediaFolder[]> {
    return this.getBy("parentId", parentId);
  }

  async getByBinding(binding: string): Promise<MediaFolder | undefined> {
    const folders = await this.table
      .getAll(binding, "binding")
      .slice(0, 1)
      .run();
    return MediaFolderModel.fromDatabase(folders[0]);
  }

  async getDescendants(folderId: string): Promise<MediaFolder[]> {
    const folders = await this.table
      .filter((folder) => folder.key("path").includes(folderId))
      .run();
    return folders
      .map((folder) => MediaFolderModel.fromDatabase(folder))
      .filter((folder): folder is MediaFolder => folder !== undefined);
  }
}
