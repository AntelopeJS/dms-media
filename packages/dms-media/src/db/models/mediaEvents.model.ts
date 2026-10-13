import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { MEDIA_EVENTS_TABLE_NAME, MediaEvent } from "../tables";

export class MediaEventModel extends BasicDataModel(
  MediaEvent,
  MEDIA_EVENTS_TABLE_NAME,
) {
  /** Newest events first, bounded. */
  async listRecent(limit: number): Promise<MediaEvent[]> {
    const rows = await this.table
      .orderBy("createdAt", "desc")
      .slice(0, limit)
      .run();
    return rows
      .map((row) => MediaEventModel.fromDatabase(row))
      .filter((row): row is MediaEvent => row !== undefined);
  }

  async listByAsset(assetId: string): Promise<MediaEvent[]> {
    const events = await this.getBy("assetId", assetId);
    return events.sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const rows = await this.table
      .filter((row) => row.key("createdAt").lt(cutoff))
      .run();
    const ids = rows
      .map((row) => MediaEventModel.fromDatabase(row)?._id)
      .filter((id): id is string => id !== undefined);
    await Promise.all(ids.map((id) => this.delete(id)));
    return ids.length;
  }
}
