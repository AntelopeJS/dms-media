import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantModel } from "@antelopejs/interface-dms/db";
import { DeleteFile } from "@antelopejs/interface-file-storage";
import cron, { type ScheduledTask } from "node-cron";
import { MediaUploadModel } from "../db";

export const PURGE_STAGING_CRON_NAME = "dms-media-purge-staging";

export const PURGE_STAGING_SCHEDULE = "30 * * * *";
const STAGING_RETENTION_HOURS = 24;
const MS_PER_HOUR = 60 * 60 * 1000;

/** Deletes the staged files of one tenant's uploads abandoned before confirm. */
export async function purgeTenantStaging(
  tenantId: string,
  cutoff: Date,
): Promise<number> {
  const uploadModel = GetModel(MediaUploadModel, tenantId);
  const abandoned = await uploadModel.listOlderThan(cutoff);
  for (const upload of abandoned) {
    await DeleteFile(upload.resourceKey, upload.storage).catch(() => undefined);
    await uploadModel.delete(upload._id);
  }
  return abandoned.length;
}

export async function runPurgeStaging(now = new Date()): Promise<number> {
  const cutoff = new Date(
    now.getTime() - STAGING_RETENTION_HOURS * MS_PER_HOUR,
  );
  let purged = 0;
  for await (const tenant of GetModel(TenantModel).table) {
    purged += await purgeTenantStaging(tenant._id, cutoff);
  }
  if (purged)
    Logging.Info(`Purge media staging: removed ${purged} abandoned upload(s).`);
  return purged;
}

export function schedulePurgeStaging(): ScheduledTask {
  return cron.schedule(PURGE_STAGING_SCHEDULE, () => {
    void runPurgeStaging().catch((error: unknown) => {
      Logging.Error(`Cron '${PURGE_STAGING_CRON_NAME}' failed:`, error);
    });
  });
}
