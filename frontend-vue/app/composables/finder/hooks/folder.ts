import type { FolderItemPublic } from "../../../utils/finder/models";
import DeleteFolderConfirm from "../../../components/finder/components/DeleteFolderConfirm.vue";

export function createFolderHooksRegistrar(): HookRegistrar {
  return () => {
    const { currentFolder, openedFolder, currentFile } = useFinderContext();
    const { handleAddFolder, handleDeleteItem, handleUpdateItem } =
      useFinderStore();
    const { editedFolder } = useFinderContext();
    const { toggleFavorite } = useFavoritesFolder();
    const hooks = useFinderHooks();
    const { t } = useI18n();

    const overlay = useOverlay();
    const confirmDeleteModal = overlay.create(DeleteFolderConfirm);

    hooks.hook("folder:edit", (folder) => {
      editedFolder.value = folder;
    });

    hooks.hook("folder:rename", (item: FolderItemPublic) => {
      hooks.callHook("folder:edit", item);
    });

    hooks.hook("folder:update", handleUpdateItem);

    hooks.hook("folder:delete", async (folder: FolderItemPublic) => {
      if (folder.childrenIds.length > 0) {
        const isConfirmed = await confirmDeleteModal.open({
          title: t("dms.finder.delete.confirm_title"),
          description: t("dms.finder.delete.confirm_description", {
            count: folder.childrenIds.length,
          }),
        });
        if (!isConfirmed) return;
      }

      await handleDeleteItem(folder);
    });

    hooks.hook("folder:open", (folder: FolderItemPublic | null) => {
      openedFolder.value = folder;
      currentFolder.value = folder;
      currentFile.value = null;
      hooks.callHook("navigate:to");
    });

    hooks.hook("folder:new", async () => {
      const newFolder = await handleAddFolder(openedFolder.value?.id ?? null);
      if (!newFolder) return;
      hooks.callHook("folder:edit", newFolder);
    });

    hooks.hook("folder:toggleFavorite", (folder: FolderItemPublic) => {
      toggleFavorite(folder.id);
    });

    hooks.hook("folder:details:activate", (folder: FolderItemPublic) => {
      currentFolder.value = folder;
    });

    hooks.hook("folder:details:inactive", () => {
      currentFolder.value = null;
    });
  };
}
