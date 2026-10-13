import { GetModel } from "@antelopejs/interface-database-decorators";
import { MediaFavoriteModel, type MediaFavoriteKind } from "../db";

export interface FavoriteOwner {
  tenantId: string;
  userId: string;
}

export interface StarredTargets {
  assetIds: Set<string>;
  folderIds: Set<string>;
  all: Set<string>;
}

function favoriteModel(owner: FavoriteOwner): MediaFavoriteModel {
  return GetModel(MediaFavoriteModel, owner.tenantId);
}

export async function loadStarredTargets(
  owner: FavoriteOwner,
): Promise<StarredTargets> {
  const favorites = await favoriteModel(owner).listForUser(owner.userId);
  const idsOf = (kind: MediaFavoriteKind) =>
    new Set(
      favorites
        .filter((favorite) => favorite.kind === kind)
        .map((favorite) => favorite.targetId),
    );
  return {
    assetIds: idsOf("asset"),
    folderIds: idsOf("folder"),
    all: new Set(favorites.map((favorite) => favorite.targetId)),
  };
}

export async function setStarred(
  owner: FavoriteOwner,
  kind: MediaFavoriteKind,
  targetId: string,
  starred: boolean,
): Promise<void> {
  const model = favoriteModel(owner);
  const existing = await model.findForUser(owner.userId, kind, targetId);
  if (starred && !existing) {
    await model.insert({ userId: owner.userId, kind, targetId });
  }
  if (!starred && existing) {
    await model.delete(existing._id);
  }
}

/** Drops every member's stars on targets that no longer exist. */
export async function forgetFavorites(
  tenantId: string,
  targetIds: string[],
): Promise<void> {
  await GetModel(MediaFavoriteModel, tenantId).removeTargets(targetIds);
}
