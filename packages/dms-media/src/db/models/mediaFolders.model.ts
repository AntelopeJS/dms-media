import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { MEDIA_FOLDERS_TABLE_NAME, MediaFolder } from "../tables";

export class MediaFolderModel extends BasicDataModel(
  MediaFolder,
  MEDIA_FOLDERS_TABLE_NAME,
) {
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
