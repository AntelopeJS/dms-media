import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import {
  MEDIA_FAVORITES_TABLE_NAME,
  MediaFavorite,
  type MediaFavoriteKind,
} from "../tables";

export class MediaFavoriteModel extends BasicDataModel(
  MediaFavorite,
  MEDIA_FAVORITES_TABLE_NAME,
) {
  async listForUser(userId: string): Promise<MediaFavorite[]> {
    return this.getBy("userId", userId);
  }

  async findForUser(
    userId: string,
    kind: MediaFavoriteKind,
    targetId: string,
  ): Promise<MediaFavorite | undefined> {
    const favorites = await this.listForUser(userId);
    return favorites.find(
      (favorite) => favorite.kind === kind && favorite.targetId === targetId,
    );
  }

  async removeTargets(targetIds: string[]): Promise<void> {
    if (targetIds.length === 0) return;
    const favorites = await this.getBy("targetId", ...targetIds);
    await Promise.all(favorites.map((favorite) => this.delete(favorite._id)));
  }
}
