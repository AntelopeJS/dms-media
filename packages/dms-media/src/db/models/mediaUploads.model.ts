import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { MEDIA_UPLOADS_TABLE_NAME, MediaUpload } from "../tables";

export class MediaUploadModel extends BasicDataModel(
  MediaUpload,
  MEDIA_UPLOADS_TABLE_NAME,
) {
  async forgetKey(resourceKey: string): Promise<void> {
    const rows = await this.getBy("resourceKey", resourceKey);
    await Promise.all(rows.map((row) => this.delete(row._id)));
  }

  async listOlderThan(cutoff: Date): Promise<MediaUpload[]> {
    const rows = await this.table
      .filter((row) => row.key("createdAt").lt(cutoff))
      .run();
    return rows
      .map((row) => MediaUploadModel.fromDatabase(row))
      .filter((row): row is MediaUpload => row !== undefined);
  }
}
