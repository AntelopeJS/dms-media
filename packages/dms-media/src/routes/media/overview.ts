import { GetModel } from "@antelopejs/interface-database-decorators";
import { Get, Parameter } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { HasPermission } from "@antelopejs/interface-dms/permissions";
import type { ActivityFeedItem } from "@antelopejs/interface-dms/base/activity-feed";
import { getMediaConfig } from "../../config";
import { type MediaAsset, type MediaEvent, MediaEventModel } from "../../db";
import { buildActivityItems, isActivityFilter } from "../../library/activity";
import { countFailedUploads } from "../../library/batches";
import { fileLink } from "../../library/links";
import { loadAssetsInFolders } from "../../library/listing";
import {
  buildAttentionItems,
  buildKpiItems,
  buildStorageMeter,
  type OverviewInput,
  recentAssets,
} from "../../library/overview";
import { libraryVersion } from "../../library/realtime";
import { loadUploadHistoryEvents } from "../../library/upload-history";
import { MEDIA_PAGE_PERMISSION } from "../../pages/files";
import { requireReadableAsset } from "./assets";
import { MediaApiController } from "./controller";
import type { MediaRequestContext } from "./context";
import { buildAssetDto, resolveEffectiveVisibility } from "./dto";

const HTTP_FORBIDDEN = 403;
const EVENTS_SCANNED = 400;
/** A narrowed feed reads further back, so a rare kind still fills it. */
const FILTERED_EVENTS_SCANNED = 2000;
const DEFAULT_FEED_LENGTH = 12;
const MAX_FEED_LENGTH = 50;
const RECENT_FILES = 6;
/** The overview blocks read the library together: one read serves them all. */
const ASSETS_CACHE_TTL_MS = 5000;

interface CachedAssets {
  version: number;
  readAt: number;
  assets: Promise<MediaAsset[]>;
}

const assetsCache = new Map<string, CachedAssets>();

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
  scanned = EVENTS_SCANNED,
): Promise<MediaEvent[]> {
  const events = await GetModel(MediaEventModel, context.tenantId).listRecent(
    scanned,
  );
  return events.filter((event) => isEventVisible(context, event));
}

async function countTodayFailures(
  context: MediaRequestContext,
  now: Date,
): Promise<number> {
  const events = await loadUploadHistoryEvents(
    context.tenantId,
    context.access.readable,
    now,
  );
  return countFailedUploads(events, now);
}

function clampFeedLength(raw: string | undefined): number {
  const parsed = Number(raw ?? DEFAULT_FEED_LENGTH);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_FEED_LENGTH;
  return Math.min(Math.floor(parsed), MAX_FEED_LENGTH);
}

function pruneAssetsCache(now: number): void {
  for (const [key, entry] of assetsCache) {
    if (now - entry.readAt >= ASSETS_CACHE_TTL_MS) assetsCache.delete(key);
  }
}

function readableAssets(context: MediaRequestContext): Promise<MediaAsset[]> {
  const key = `${context.tenantId}:${context.user._id}`;
  const now = Date.now();
  pruneAssetsCache(now);
  const cached = assetsCache.get(key);
  if (
    cached &&
    cached.version === libraryVersion() &&
    now - cached.readAt < ASSETS_CACHE_TTL_MS
  )
    return cached.assets;
  const assets = loadAssetsInFolders(context.assetModel, [
    ...context.access.readable,
  ]);
  assetsCache.set(key, { version: libraryVersion(), readAt: now, assets });
  assets.catch(() => assetsCache.delete(key));
  return assets;
}

/** A file's own history links nowhere it already is. */
function unlinkCurrentFile(
  items: ActivityFeedItem[],
  assetId: string,
): ActivityFeedItem[] {
  const self = fileLink(assetId);
  return items.map((item) =>
    item.to === self ? { ...item, to: undefined } : item,
  );
}

/**
 * The overview's figures and feed. They describe the whole library, so they
 * are the owner's: the overview page is module-only, and a member reaches
 * media through the fields of the project's pages.
 */
export class MediaOverviewController extends MediaApiController {
  private async ownerContext(): Promise<MediaRequestContext> {
    const context = await this.resolveContext();
    const isOwner = await HasPermission(
      context.permissions,
      MEDIA_PAGE_PERMISSION,
    );
    assert(isOwner, HTTP_FORBIDDEN, "The overview is reserved to owners");
    return context;
  }

  private async overviewInput(
    context: MediaRequestContext,
  ): Promise<OverviewInput> {
    return {
      assets: await readableAssets(context),
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
    const context = await this.ownerContext();
    return { items: buildKpiItems(await this.overviewInput(context)) };
  }

  @Get("/stats/storage")
  async storage() {
    const context = await this.ownerContext();
    return buildStorageMeter(await this.overviewInput(context));
  }

  @Get("/stats/attention")
  async attention() {
    const context = await this.ownerContext();
    const input = await this.overviewInput(context);
    return {
      items: buildAttentionItems({
        ...input,
        failedUploads: await countTodayFailures(context, input.now),
      }),
    };
  }

  @Get("/stats/recent")
  async recent() {
    const context = await this.ownerContext();
    const assets = await readableAssets(context);
    return {
      assets: recentAssets(assets, RECENT_FILES).map((asset) =>
        buildAssetDto(context, asset),
      ),
    };
  }

  @Get("/activity")
  async activity() {
    const context = await this.ownerContext();
    const query = this.readQuery();
    const filter = isActivityFilter(query.type) ? query.type : undefined;
    const events = await loadVisibleEvents(
      context,
      filter ? FILTERED_EVENTS_SCANNED : EVENTS_SCANNED,
    );
    return {
      items: buildActivityItems(
        { events, foldersById: context.foldersById, filter },
        clampFeedLength(query.limit),
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
    const items = buildActivityItems(
      { events, foldersById: context.foldersById, foldsBulkActions: false },
      MAX_FEED_LENGTH,
    );
    return { items: unlinkCurrentFile(items, assetId) };
  }
}
