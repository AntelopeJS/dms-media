import type { MediaAsset, MediaFolder } from "../../types/media";
import type { MediaLibrary } from "./useMediaLibrary";

/** What the caller may do with the files and folders the explorer shows. */
export function createExplorerAccess(library: MediaLibrary) {
  const isBrowse = library.mode === "browse";
  const isOwner = computed(() => library.tree.tree.value?.isOwner ?? false);

  function folderOf(asset: MediaAsset): MediaFolder | undefined {
    return library.tree.foldersById.value.get(asset.folderId);
  }

  function canWriteAsset(asset: MediaAsset): boolean {
    return Boolean(folderOf(asset)?.rights.write);
  }

  function canChangeVisibility(asset: MediaAsset): boolean {
    return Boolean(folderOf(asset)?.rights.manage) && isOwner.value;
  }

  function canChangeFolderVisibility(folder: MediaFolder): boolean {
    return isBrowse && folder.rights.manage && isOwner.value;
  }

  return {
    folderOf,
    canWriteAsset,
    canChangeVisibility,
    canChangeFolderVisibility,
  };
}

export type ExplorerAccess = ReturnType<typeof createExplorerAccess>;
