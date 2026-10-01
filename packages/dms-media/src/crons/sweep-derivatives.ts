import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantModel } from "@antelopejs/interface-dms/db";
import cron, { type ScheduledTask } from "node-cron";
import { cleanupAssetFiles, updateAssetMedia } from "../asset-lifecycle";
import { getMediaConfig } from "../config";
import { type MediaAsset, MediaAssetModel } from "../db";
import { partitionDerivatives } from "../derivatives";
import { parseDerivatives } from "../routes/media/storage-keys";

export const SWEEP_DERIVATIVES_CRON_NAME = "dms-media-sweep-derivatives";

const SWEEP_DERIVATIVES_SCHEDULE = "0 4 * * *";

/** Rechecks one asset before detaching obsolete derivatives and replaying cleanup. */
export async function sweepAssetDerivatives(
  assetModel: MediaAssetModel,
  asset: MediaAsset,
): Promise<number> {
  for (;;) {
    const current = await assetModel.get(asset._id);
    if (!current || current.isDeleting) break;
    const { fresh, stale } = partitionDerivatives(
      parseDerivatives(current),
      getMediaConfig().presets.values(),
    );
    if (Object.keys(stale).length === 0) break;
    if (
      await updateAssetMedia(assetModel, current, {
        json_derivatives: Object.keys(fresh).length
          ? JSON.stringify(fresh)
          : "",
      })
    )
      break;
  }
  return cleanupAssetFiles(assetModel, asset._id);
}

async function sweepTenantDerivatives(tenantId: string): Promise<number> {
  const assetModel = GetModel(MediaAssetModel, tenantId);
  let removed = 0;
  for await (const asset of assetModel.table) {
    removed += await sweepAssetDerivatives(assetModel, asset);
  }
  return removed;
}

export async function runSweepStaleDerivatives(): Promise<void> {
  const tenants = GetModel(TenantModel).table;
  let removed = 0;
  let tenantCount = 0;
  for await (const tenant of tenants) {
    tenantCount++;
    removed += await sweepTenantDerivatives(tenant._id);
  }
  Logging.Info(
    `Sweep media derivatives: completed ${removed} file cleanup(s) across ${tenantCount} tenant(s).`,
  );
}

export function scheduleSweepStaleDerivatives(): ScheduledTask {
  return cron.schedule(SWEEP_DERIVATIVES_SCHEDULE, () => {
    void runSweepStaleDerivatives().catch((error: unknown) => {
      Logging.Error(`Cron '${SWEEP_DERIVATIVES_CRON_NAME}' failed:`, error);
    });
  });
}
