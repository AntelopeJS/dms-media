import type { InjectionKey } from "vue";
import LockedDialog from "../../components/dialogs/LockedDialog.vue";
import ShortcutsDialog from "../../components/dialogs/ShortcutsDialog.vue";
import type { MediaAsset, MediaFolder } from "../../types/media";
import { createExplorerAccess } from "./explorerAccess";
import { createExplorerMenus } from "./explorerMenus";
import { createMoveCommands } from "./explorerMoveCommands";
import { createNamingCommands } from "./explorerNamingCommands";
import { createRemovalCommands } from "./explorerRemovalCommands";
import { createUploadCommand } from "./explorerUploadCommand";
import type { MediaLibrary } from "./useMediaLibrary";

export interface ExplorerHandlers {
  /** Opens the OS file dialog; the shell owns the hidden input. */
  pickFiles: (folderId: string, folderName: string) => void;
  /** Opens the preview lightbox on a file. */
  preview: (asset: MediaAsset) => void;
}

/** Every command of the explorer, its dialogs and the menus that offer them. */
export function useExplorerCommands(
  library: MediaLibrary,
  handlers: ExplorerHandlers,
) {
  const shortcutsDialog = useOverlay().create(ShortcutsDialog);
  const lockedDialog = useOverlay().create(LockedDialog);
  const assetLink = useAssetLink();
  const isBrowse = library.mode === "browse";
  const access = createExplorerAccess(library);
  const { canWriteAsset, canChangeVisibility } = access;

  function showLocked(folder: MediaFolder): Promise<void> {
    return lockedDialog.open({ folder }).then(() => undefined);
  }

  function showShortcuts(): void {
    void shortcutsDialog.open();
  }

  function copyLink(asset: MediaAsset): Promise<void> {
    const makePublic = () =>
      library.actions.setAssetsVisibility([asset], "public");
    return assetLink.copyLink(
      asset,
      canChangeVisibility(asset) ? { makePublic } : {},
    );
  }

  function openDetails(asset: MediaAsset): void {
    if (!isBrowse) return;
    const { sort, direction, type } = library.listing.filters.value;
    void navigateDms(fileLink(asset.id, { sort, direction, type }));
  }

  function edit(asset: MediaAsset): void {
    if (isBrowse && isEditableAsset(asset) && canWriteAsset(asset))
      void navigateDms(editorLink(asset.id));
  }

  const commands = {
    preview: handlers.preview,
    canWriteAsset,
    canChangeVisibility,
    canChangeFolderVisibility: access.canChangeFolderVisibility,
    ...createNamingCommands(library, showLocked),
    ...createMoveCommands(library, showLocked),
    ...createRemovalCommands(library, access, showLocked),
    showLocked,
    showShortcuts,
    upload: createUploadCommand(library, handlers),
    copyLink,
    openDetails,
    edit,
  };
  return { ...commands, ...createExplorerMenus(library, commands) };
}

export type ExplorerCommands = ReturnType<typeof useExplorerCommands>;

const COMMANDS_KEY: InjectionKey<ExplorerCommands> = Symbol(
  "dms-media-explorer-commands",
);

export function provideExplorerCommands(commands: ExplorerCommands): void {
  provide(COMMANDS_KEY, commands);
}

/** The library and commands the explorer's panels read. */
export interface ExplorerContext {
  library: MediaLibrary;
  commands: ExplorerCommands;
}

export function useExplorerContext(): ExplorerContext {
  const commands = inject(COMMANDS_KEY);
  if (!commands)
    throw new Error("useExplorerContext() needs a media explorer above it");
  return { library: useMediaLibrary(), commands };
}
