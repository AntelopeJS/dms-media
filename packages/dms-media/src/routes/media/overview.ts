import { GetModel } from "@antelopejs/interface-database-decorators";
import { Get, Parameter } from "@antelopejs/interface-api";
import { parseFolderAcl } from "../../acl";
import { getMediaConfig } from "../../config";
import { type MediaAsset, type MediaEvent, MediaEventModel } from "../../db";
import { buildActivityItems } from "../../library/activity";
import { readEventDetails } from "../../library/events";
import { computeFolderStats } from "../../library/folder-stats";
import { loadAssetsInFolders } from "../../library/listing";
import {
  buildAttentionItems,
  buildFolderCards,
  buildKpiItems,
  buildLargestFolders,
  buildStorageMeter,
  type OverviewInput,
  recentAssets,
} from "../../library/overview";
import { requireReadableAsset } from "./assets";
import { MediaApiController } from "./controller";
import type { MediaRequestContext } from "./context";
import { buildAssetDto, resolveEffectiveVisibility } from "./dto";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EVENTS_SCANNED = 400;
const DEFAULT_FEED_LENGTH = 12;
const MAX_FEED_LENGTH = 50;
const RECENT_FILES = 6;
const RESTRICTED_FOLDERS_SHOWN = 2;

function isEventVisible(
  context: MediaRequestContext,
  event: MediaEvent,
): boolean {
  if (!event.folderId) return context.rootRights.has("read");
  return (
    context.access.readable.has(event.folderId) ||
    !context.foldersById.has(event.folderId)
  );
}

async function loadVisibleEvents(
  context: MediaRequestContext,
): Promise<MediaEvent[]> {
  const events = await GetModel(MediaEventModel, context.tenantId).listRecent(
    EVENTS_SCANNED,
  );
  return events.filter((event) => isEventVisible(context, event));
}

function countRecentFailures(events: MediaEvent[], now: Date): number {
  const since = now.getTime() - MS_PER_DAY;
  return events
    .filter(
      (event) =>
        event.kind === "upload.batch" && event.createdAt.getTime() >= since,
    )
    .reduce(
      (total, event) => total + Number(readEventDetails(event).failed ?? 0),
      0,
    );
}

function clampFeedLength(raw: string | undefined): number {
  const parsed = Number(raw ?? DEFAULT_FEED_LENGTH);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_FEED_LENGTH;
  return Math.min(Math.floor(parsed), MAX_FEED_LENGTH);
}

export class MediaOverviewController extends MediaApiController {
  private async overviewInput(
    context: MediaRequestContext,
  ): Promise<OverviewInput> {
    const assets = await loadAssetsInFolders(context.assetModel, [
      ...context.access.readable,
    ]);
    const folders = context.folders.filter((folder) =>
      context.access.readable.has(folder._id),
    );
    return {
      assets,
      folders,
      stats: computeFolderStats(context.folders, assets),
      visibilityOf: (asset: MediaAsset) =>
        resolveEffectiveVisibility(
          asset,
          context.foldersById.get(asset.folderId),
        ),
      quotaBytes: getMediaConfig().storageQuotaBytes,
      now: new Date(),
    };
  }

  @Get("/stats/kpis")
  async kpis() {
    const context = await this.resolveContext();
    return { items: buildKpiItems(await this.overviewInput(context)) };
  }

  @Get("/stats/storage")
  async storage() {
    const context = await this.resolveContext();
    return buildStorageMeter(await this.overviewInput(context));
  }

  @Get("/stats/largest")
  async largest() {
    const context = await this.resolveContext();
    return { items: buildLargestFolders(await this.overviewInput(context)) };
  }

  @Get("/stats/attention")
  async attention() {
    const context = await this.resolveContext();
    const [input, events] = await Promise.all([
      this.overviewInput(context),
      loadVisibleEvents(context),
    ]);
    const restrictedFolders = context.folders
      .filter(
        (folder) =>
          parseFolderAcl(folder) !== undefined &&
          !folder.binding &&
          (context.access.readable.has(folder._id) ||
            context.access.shells.has(folder._id)),
      )
      .slice(0, RESTRICTED_FOLDERS_SHOWN);
    return {
      items: buildAttentionItems({
        ...input,
        failedUploads: countRecentFailures(events, input.now),
        restrictedFolders,
      }),
    };
  }

  @Get("/stats/folders")
  async folderCards() {
    const context = await this.resolveContext();
    return { items: buildFolderCards(await this.overviewInput(context)) };
  }

  @Get("/stats/recent")
  async recent() {
    const context = await this.resolveContext();
    const assets = await loadAssetsInFolders(context.assetModel, [
      ...context.access.readable,
    ]);
    return {
      assets: recentAssets(assets, RECENT_FILES).map((asset) =>
        buildAssetDto(context, asset),
      ),
    };
  }

  @Get("/activity")
  async activity() {
    const context = await this.resolveContext();
    const events = await loadVisibleEvents(context);
    const limit = clampFeedLength(this.readQuery().limit);
    return {
      items: buildActivityItems(
        { events, foldersById: context.foldersById },
        limit,
      ),
    };
  }

  @Get("/assets/:assetId/history")
  async history(@Parameter("assetId", "param") assetId: string) {
    const context = await this.resolveContext();
    await requireReadableAsset(context, assetId);
    const events = await GetModel(
      MediaEventModel,
      context.tenantId,
    ).listByAsset(assetId);
    return {
      items: buildActivityItems(
        { events, foldersById: context.foldersById },
        MAX_FEED_LENGTH,
      ),
    };
  }
}
