import type { DropdownMenuItem } from "@nuxt/ui";
import type { MediaAsset, MediaFolder } from "../../types/media";
import { folderMenu } from "./explorerFolderMenus";
import { singleFileMenu } from "./explorerFileMenus";
import type { MenuCommands } from "./explorerMenuCommands";
import { selectionMenu } from "./explorerSelectionMenu";
import type { MediaLibrary } from "./useMediaLibrary";

/** The context menus of files and folders, built from the commands. */
export function createExplorerMenus(
  library: MediaLibrary,
  commands: MenuCommands,
) {
  function fileMenu(asset: MediaAsset): DropdownMenuItem[][] {
    const selected = library.selection.selectedAssets.value;
    const isInSelection =
      library.selection.selectedIds.value.has(asset.id) && selected.length > 1;
    return isInSelection
      ? selectionMenu(library, commands, selected)
      : singleFileMenu(library, commands, asset);
  }

  return {
    fileMenu,
    folderMenu: (folder: MediaFolder) => folderMenu(library, commands, folder),
  };
}
