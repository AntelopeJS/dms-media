import type { MediaAsset, MediaFolder } from "../../types/media";

const MENU_SETTLE_MS = 80;

type CommandResult = void | Promise<void>;
type AssetCommand = (asset: MediaAsset) => CommandResult;
type AssetsCommand = (assets: MediaAsset[]) => CommandResult;
type FolderCommand = (folder: MediaFolder) => CommandResult;

/** The commands the context menus offer. */
export interface MenuCommands {
  preview: AssetCommand;
  openDetails: AssetCommand;
  edit: AssetCommand;
  copyLink: AssetCommand;
  renameAsset: AssetCommand;
  moveAssets: AssetsCommand;
  changeVisibility: AssetsCommand;
  deleteAssets: AssetsCommand;
  canWriteAsset: (asset: MediaAsset) => boolean;
  canChangeVisibility: (asset: MediaAsset) => boolean;
  canChangeFolderVisibility: (folder: MediaFolder) => boolean;
  upload: (folderId?: string | null) => CommandResult;
  newFolder: (parentId?: string | null) => CommandResult;
  showLocked: FolderCommand;
  renameFolder: FolderCommand;
  moveFolder: FolderCommand;
  changeFolderVisibility: FolderCommand;
  deleteFolder: FolderCommand;
}

function afterMenusClose(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MENU_SETTLE_MS));
}

/** Runs a command once the menu closed, so its dialog takes the focus. */
export const afterMenu = (run: () => CommandResult) => async () => {
  await afterMenusClose();
  await run();
};
