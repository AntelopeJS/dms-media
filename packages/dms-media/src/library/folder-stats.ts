import type { MediaFolder } from "../db";
import type { FolderCount } from "./asset-totals";

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

/** The files and bytes stored directly in one folder. */
export type FolderContent = Pick<FolderCount, "folderId" | "files" | "size">;

/** Recursive file counts and sizes of every folder, from what each folder holds directly. */
export function computeFolderStats(
  folders: MediaFolder[],
  contents: FolderContent[],
): Map<string, FolderStats> {
  const stats = new Map(folders.map((folder) => [folder._id, emptyStats()]));
  const foldersById = new Map(folders.map((folder) => [folder._id, folder]));
  for (const content of contents) {
    const folder = foldersById.get(content.folderId);
    if (!folder) continue;
    const direct = stats.get(folder._id);
    if (direct) direct.directFileCount += content.files;
    for (const folderId of [...folder.path, folder._id]) {
      const entry = stats.get(folderId);
      if (!entry) continue;
      entry.fileCount += content.files;
      entry.size += content.size;
    }
  }
  return stats;
}

/** One file's share of its folder's content. */
export function assetContent(asset: {
  folderId: string;
  size: number;
}): FolderContent {
  return { folderId: asset.folderId, files: 1, size: asset.size };
}
