import MoveDialog from "../../components/dialogs/MoveDialog.vue";
import type { MediaAsset, MediaFolder } from "../../types/media";
import type { MediaLibrary, NameOutcome } from "./useMediaLibrary";

/** The commands that move files or a folder into another folder, chosen in a dialog. */
export function createMoveCommands(
  library: MediaLibrary,
  showLocked: (folder: MediaFolder) => Promise<void>,
) {
  const { t } = library;
  const moveDialog = useOverlay().create(MoveDialog);
  const { prefs, rememberDestination } = useMediaPrefs();

  async function createFolderForMove(
    name: string,
    parentId: string | null,
  ): Promise<NameOutcome> {
    const outcome = await library.actions.createFolder(
      name,
      parentId ?? undefined,
    );
    if (outcome.id) moveDialog.patch({ folders: library.tree.folders.value });
    return outcome;
  }

  async function moveAssets(assets: MediaAsset[]): Promise<void> {
    if (assets.length === 0) return;
    const sharedFolderId =
      sharedValue(assets.map((asset) => asset.folderId)) ?? null;
    const target = await moveDialog.open({
      title: t(
        "dms_media.dialogs.move.files_title",
        { count: assets.length },
        assets.length,
      ),
      folders: library.tree.folders.value,
      currentFolderId: sharedFolderId,
      revealId: sharedFolderId ?? library.currentFolder.value?.id ?? null,
      right: "write",
      recentIds: [...prefs.value.recentDestinations],
      createFolder: createFolderForMove,
    });
    if (!target) return;
    rememberDestination(target);
    await library.actions.moveAssets(assets, target);
  }

  async function moveFolder(folder: MediaFolder): Promise<void> {
    if (folder.bound) return showLocked(folder);
    const excluded = [
      folder.id,
      ...library.tree.descendantsOf(folder.id).map((child) => child.id),
    ];
    const target = await moveDialog.open({
      title: t("dms_media.dialogs.move.folder_title", { name: folder.name }),
      folders: library.tree.folders.value,
      currentFolderId: folder.parentId,
      revealId: folder.parentId,
      excludedIds: excluded,
      right: "manage",
      refuseBound: true,
      allowRoot: true,
      rootAllowed:
        Boolean(library.tree.tree.value?.root.manage) &&
        folder.parentId !== null,
    });
    if (target !== undefined) await library.actions.moveFolder(folder, target);
  }

  return { moveAssets, moveFolder };
}
