import { IsDuplicateKeyError } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { getMediaConfig } from "../config";
import { MediaAssetModel, MediaQuotaAlertModel } from "../db";
import { fixedId } from "../fixed-id";
import { sumStoredBytes } from "../library/listing";
import { usedPercent } from "../services/listing";
import { acceptsTenant } from "./channel";
import { commonFields, type RecordedMediaEvent } from "./recorded";
import {
  storageThresholdChannel,
  thresholdPercentOf,
} from "./triggers/storage-threshold";

/** Usage must drop this many points below a threshold before it fires again. */
const REARM_MARGIN_PERCENT = 5;

const PERCENT = 100;

/** The alert row of one threshold of one tenant; the tenant is in it because row ids are unique across tenants. */
export function quotaAlertId(tenantId: string, percent: number): string {
  return fixedId("dms-media:quota-alert", tenantId, String(percent));
}

function thresholdBytes(quota: number, percent: number): number {
  return Math.floor((quota * percent) / PERCENT);
}

function watchedPercents(tenantId: string): number[] {
  const percents = storageThresholdChannel
    .configs()
    .filter((config) => acceptsTenant(config, tenantId))
    .map(thresholdPercentOf);
  return [...new Set(percents)];
}

/** Records a crossing once per tenant and threshold. False when it is already recorded. */
async function recordCrossing(
  alerts: MediaQuotaAlertModel,
  row: {
    _id: string;
    percent: number;
    thresholdBytes: number;
    usedBytes: number;
    crossedAt: Date;
  },
): Promise<boolean> {
  try {
    await alerts.insert(row);
    return true;
  } catch (error) {
    if (!IsDuplicateKeyError(error)) throw error;
    return false;
  }
}

/**
 * After a write that grew the library: fires `media.storage-threshold` for
 * each threshold a subscription watches that usage has reached and that no
 * earlier write or instance has recorded yet.
 */
export async function evaluateQuotaGrowth(
  event: RecordedMediaEvent,
): Promise<void> {
  const quota = getMediaConfig().storageQuotaBytes;
  const tenantId = event.actor.tenantId;
  if (!quota || !storageThresholdChannel.isArmed) return;
  const percents = watchedPercents(tenantId);
  if (percents.length === 0) return;
  const usedBytes = await sumStoredBytes(GetModel(MediaAssetModel, tenantId));
  const alerts = GetModel(MediaQuotaAlertModel, tenantId);
  for (const percent of percents) {
    const threshold = thresholdBytes(quota, percent);
    if (usedBytes < threshold) continue;
    const crossedAt = new Date();
    const crossed = await recordCrossing(alerts, {
      _id: quotaAlertId(tenantId, percent),
      percent,
      thresholdBytes: threshold,
      usedBytes,
      crossedAt,
    });
    if (!crossed) continue;
    storageThresholdChannel.emit(`${tenantId}:${percent}`, {
      payload: {
        ...commonFields(
          event,
          `media.storage-threshold:${tenantId}:${percent}:${crossedAt.toISOString()}`,
        ),
        percent,
        thresholdBytes: threshold,
        usedBytes,
        quotaBytes: quota,
        usedPercent: usedPercent(usedBytes, quota),
        triggeringKind: event.input.kind,
      },
    });
  }
}

/**
 * After a write that shrank the library: forgets each crossed threshold
 * usage is now {@link REARM_MARGIN_PERCENT} points below, so it fires again
 * on the next crossing.
 */
export async function evaluateQuotaShrink(tenantId: string): Promise<void> {
  const quota = getMediaConfig().storageQuotaBytes;
  if (!quota) return;
  const alerts = GetModel(MediaQuotaAlertModel, tenantId);
  const crossed = await alerts.getAll();
  if (crossed.length === 0) return;
  const usedBytes = await sumStoredBytes(GetModel(MediaAssetModel, tenantId));
  const rearmed = crossed.filter(
    (alert) =>
      usedBytes < thresholdBytes(quota, alert.percent - REARM_MARGIN_PERCENT),
  );
  await Promise.all(rearmed.map((alert) => alerts.delete(alert._id)));
}
