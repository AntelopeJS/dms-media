import DestinationDialog from "../../components/dialogs/DestinationDialog.vue";
import type { MediaFolder } from "../../types/media";
import type { ExplorerHandlers } from "./useExplorerCommands";
import type { MediaLibrary } from "./useMediaLibrary";

/** The upload command: it picks the folder the files go to, asking when the current one takes none. */
export function createUploadCommand(
  library: MediaLibrary,
  handlers: ExplorerHandlers,
) {
  const { t } = library;
  const destinationDialog = useOverlay().create(DestinationDialog);
  const { prefs, update: updatePrefs } = useMediaPrefs();

  async function folderById(
    folderId: string,
  ): Promise<MediaFolder | undefined> {
    const known = library.tree.foldersById.value.get(folderId);
    if (known) return known;
    await library.tree.refresh();
    return library.tree.foldersById.value.get(folderId);
  }

  async function upload(folderId?: string | null): Promise<void> {
    const target = folderId
      ? library.tree.foldersById.value.get(folderId)
      : library.currentFolder.value;
    if (target?.rights.write) return handlers.pickFiles(target.id, target.name);
    await library.tree.ready();
    const canCreateAtRoot =
      !library.tree.scopeFolder.value &&
      Boolean(library.tree.tree.value?.root.manage);
    if (
      !canCreateAtRoot &&
      !library.tree.folders.value.some((folder) => folder.rights.write)
    ) {
      library.toast.add({
        title: t("dms_media.toasts.no_writable_folder"),
        color: "error",
        icon: "i-ph-warning",
      });
      return;
    }
    const chosen = await destinationDialog.open({
      folders: library.tree.folders.value,
      initialId: prefs.value.lastFolderId,
      accept: library.accept,
      scopeFolderId: library.scopeFolderId,
    });
    if (!chosen) return;
    const destination = await folderById(chosen);
    if (!destination) {
      library.toast.add({
        title: t("dms_media.toasts.destination_unavailable"),
        color: "error",
        icon: "i-ph-warning",
      });
      return;
    }
    updatePrefs({ lastFolderId: destination.id });
    handlers.pickFiles(destination.id, destination.name);
  }

  return upload;
}
