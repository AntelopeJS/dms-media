import type { MediaAsset, MediaFolder } from "../db";

export interface FolderStats {
  /** Files in the folder and every subfolder. */
  fileCount: number;
  /** Bytes of those files. */
  size: number;
  /** Files directly in the folder. */
  directFileCount: number;
}

function emptyStats(): FolderStats {
  return { fileCount: 0, size: 0, directFileCount: 0 };
}

/** Recursive file counts and sizes of every folder, from one pass over the assets. */
export function computeFolderStats(
  folders: MediaFolder[],
  assets: MediaAsset[],
): Map<string, FolderStats> {
  const stats = new Map(folders.map((folder) => [folder._id, emptyStats()]));
  const foldersById = new Map(folders.map((folder) => [folder._id, folder]));
  for (const asset of assets) {
    const folder = foldersById.get(asset.folderId);
    if (!folder) continue;
    const direct = stats.get(folder._id);
    if (direct) direct.directFileCount += 1;
    for (const folderId of [...folder.path, folder._id]) {
      const entry = stats.get(folderId);
      if (!entry) continue;
      entry.fileCount += 1;
      entry.size += asset.size;
    }
  }
  return stats;
}
