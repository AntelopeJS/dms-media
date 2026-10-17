import { randomUUID } from "node:crypto";
import type { AtomicMutationOutcome } from "@antelopejs/interface-database";
import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { triggerEvent } from "@antelopejs/interface-database-decorators/modifiers/common";
import { MEDIA_ASSETS_TABLE_NAME, MediaAsset } from "../tables";

export interface MediaMutationOptions {
  /** False for bookkeeping writes that must not move `updatedAt`. */
  touchesAsset?: boolean;
  /** Declarations must also preserve metadata edits, which do not advance mediaRevision. */
  preserveDetails?: boolean;
}

function mutationApplied(outcome: AtomicMutationOutcome): boolean {
  if (outcome === "unknown")
    throw new Error("Media mutation acknowledgement is unknown");
  return outcome === "applied";
}

export class MediaAssetModel extends BasicDataModel(
  MediaAsset,
  MEDIA_ASSETS_TABLE_NAME,
) {
  /** Applies a media transition only to the observed revision, with update modifiers. */
  async compareMedia(
    expected: MediaAsset,
    patch: Partial<MediaAsset>,
    options: MediaMutationOptions = {},
  ): Promise<boolean> {
    const instance = MediaAssetModel.fromPlainData(patch);
    if (options.touchesAsset !== false) triggerEvent(instance, "update");
    const payload = MediaAssetModel.toDatabase(instance);
    if (options.preserveDetails) {
      const count = await this.table
        .filter((row) =>
          row
            .key("_id")
            .eq(expected._id)
            .and(row.key("mediaRevision").eq(expected.mediaRevision))
            .and(row.key("isDeleting").default(false).eq(false))
            .and(row.key("name").eq(expected.name))
            .and(row.key("folderId").eq(expected.folderId))
            .and(
              row
                .key("alt")
                .default("")
                .eq(expected.alt || ""),
            )
            .and(row.key("visibility").eq(expected.visibility))
            .and(row.key("storageKey").eq(expected.storageKey)),
        )
        .update({ ...payload, mediaRevision: randomUUID() })
        .run();
      return count === 1;
    }
    const outcome = await this.table
      .atomicMutation(expected._id, {
        type: "update",
        revisionField: "mediaRevision",
        expectedRevision: expected.mediaRevision,
        nextRevision: randomUUID(),
        patch: payload,
      })
      .run();
    return mutationApplied(outcome);
  }

  /** Removes only the observed terminal tombstone after its file queue is drained. */
  async deleteCleanedAsset(expected: MediaAsset): Promise<boolean> {
    if (!expected.isDeleting || expected.json_retiredFiles !== "[]")
      return false;
    const outcome = await this.table
      .atomicMutation(expected._id, {
        type: "delete",
        revisionField: "mediaRevision",
        expectedRevision: expected.mediaRevision,
      })
      .run();
    return mutationApplied(outcome);
  }

  /** Returns a bounded prefix of assets belonging to the selected folders. */
  async listByFolders(
    folderIds: string[],
    limit: number,
  ): Promise<MediaAsset[]> {
    if (folderIds.length === 0) return [];
    const rows = await this.table
      .getAll(folderIds.length === 1 ? folderIds[0] : folderIds, "folderId")
      .filter((row) => row.key("isDeleting").default(false).eq(false))
      .slice(0, limit)
      .run();
    return rows
      .map((row) => MediaAssetModel.fromDatabase(row))
      .filter((row): row is MediaAsset => row !== undefined);
  }

  async getByFolder(folderId: string): Promise<MediaAsset[]> {
    return (await this.getBy("folderId", folderId)).filter(
      (asset) => !asset.isDeleting,
    );
  }
}
