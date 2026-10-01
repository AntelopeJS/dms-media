import { DeleteFile, FileExists } from "@antelopejs/interface-file-storage";
import { type MediaAsset, MediaAssetModel } from "./db";
import { collectAssetStorageKeys } from "./routes/media/storage-keys";

/** Reads the durable, retryable file deletion queue for an asset. */
export function retiredFiles(asset: MediaAsset): string[] {
  return JSON.parse(asset.json_retiredFiles);
}

/** Detaches references and records their cleanup in the same media transition. */
export async function updateAssetMedia(
  model: MediaAssetModel,
  asset: MediaAsset,
  patch: Partial<MediaAsset>,
): Promise<boolean> {
  if (asset.isDeleting) return false;
  const next = MediaAssetModel.fromPlainData(
    Object.assign(MediaAssetModel.toDatabase(asset), patch),
  );
  const live = new Set(next.isDeleting ? [] : collectAssetStorageKeys(next));
  const pending = retiredFiles(asset);
  if (pending.some((key) => live.has(key))) {
    throw new Error("Cannot publish a retired media file");
  }
  const retired = collectAssetStorageKeys(asset).filter(
    (key) => !live.has(key),
  );
  return model.compareMedia(asset, {
    ...patch,
    json_retiredFiles: JSON.stringify([...new Set([...pending, ...retired])]),
  });
}

async function acknowledgeFile(
  model: MediaAssetModel,
  assetId: string,
  key: string,
): Promise<void> {
  for (;;) {
    const fresh = await model.get(assetId);
    if (!fresh || !retiredFiles(fresh).includes(key)) return;
    const pending = retiredFiles(fresh).filter(
      (candidate) => candidate !== key,
    );
    if (
      await model.compareMedia(fresh, {
        json_retiredFiles: JSON.stringify(pending),
      })
    )
      return;
  }
}

/** Replays detached-file deletion; failures leave durable work for the next sweep. */
export async function cleanupAssetFiles(
  model: MediaAssetModel,
  assetId: string,
  deleteFile: typeof DeleteFile = DeleteFile,
): Promise<number> {
  const asset = await model.get(assetId);
  if (!asset) return 0;
  let removed = 0;
  for (const key of retiredFiles(asset)) {
    const fresh = await model.get(assetId);
    if (!fresh || !retiredFiles(fresh).includes(key)) continue;
    if (!fresh.isDeleting && collectAssetStorageKeys(fresh).includes(key))
      continue;
    try {
      if (await FileExists(key, fresh.storage))
        await deleteFile(key, fresh.storage);
    } catch {
      continue;
    }
    await acknowledgeFile(model, assetId, key);
    removed++;
  }
  const fresh = await model.get(assetId);
  if (fresh?.isDeleting && retiredFiles(fresh).length === 0) {
    await model.deleteCleanedAsset(fresh);
  }
  return removed;
}

/** Tombstones an asset before deleting any files, preventing late publication. */
export async function deleteMediaAsset(
  model: MediaAssetModel,
  assetId: string,
  deleteFile: typeof DeleteFile = DeleteFile,
): Promise<void> {
  for (;;) {
    const asset = await model.get(assetId);
    if (!asset) return;
    if (
      asset.isDeleting ||
      (await updateAssetMedia(model, asset, { isDeleting: true }))
    )
      break;
  }
  await cleanupAssetFiles(model, assetId, deleteFile);
}
