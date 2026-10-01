import type { FileItemPublic } from "../../../utils/finder/models";
import DmsFileManagerPreviewModal from "../../../components/finder/components/Preview.vue";
import DeleteFolderConfirm from "../../../components/finder/components/DeleteFolderConfirm.vue";
import EditImageModal from "../../../components/finder/components/EditImage.vue";

export function createFileHooksRegistrar(): HookRegistrar {
  return () => {
    const { currentFile, editedFile } = useFinderContext();
    const { handleDeleteItem, handleShare, handleUpdateItem, handleLoad } =
      useFinderStore();
    const hooks = useFinderHooks();
    const picker = useFinderPicker();
    const { selectedItems } = useFinderSelect();
    const { t } = useI18n();

    const overlay = useOverlay();
    const previewModal = overlay.create(DmsFileManagerPreviewModal);
    const confirmDeleteModal = overlay.create(DeleteFolderConfirm);
    const editImageModal = overlay.create(EditImageModal);

    hooks.hook("file:edit", (file) => {
      editedFile.value = file;
    });

    hooks.hook("file:rename", (item: FileItemPublic) => {
      hooks.callHook("file:edit", item);
    });

    hooks.hook("file:update", handleUpdateItem);

    hooks.hook("file:delete", async (file: FileItemPublic) => {
      const isConfirmed = await confirmDeleteModal.open({
        title: t("dms.finder.delete.file_confirm_title"),
        description: t("dms.finder.delete.file_confirm_description", {
          name: file.name,
        }),
      });
      if (!isConfirmed) return;

      await handleDeleteItem(file);
    });

    hooks.hook("file:download", (file: FileItemPublic) => {
      console.log(
        "[FINDER] FILE HOOKS - file:download : missing implementation",
        file,
      );
    });

    hooks.hook("file:share", handleShare);

    hooks.hook("file:edit-image", async (file: FileItemPublic) => {
      if (!isEditableImageMimetype(file.mimetype)) return;
      await editImageModal.open({ file });
      await handleLoad();
    });

    hooks.hook("file:preview:open", (file: FileItemPublic) => {
      if (!file) return;
      if (picker?.enabled) {
        if (!picker.matches(file)) return;
        const alsoSelected = picker.multiple
          ? selectedItems.value.filter(
              (item): item is FileItemPublic =>
                item.id !== file.id &&
                "mimetype" in item &&
                picker.matches(item as FileItemPublic),
            )
          : [];
        picker.pick([...alsoSelected, file]);
        return;
      }
      if (!PREVIEWABLE_TYPES.includes(file?.mimetype ?? "")) return;

      previewModal.open({ file });
    });

    hooks.hook("file:details:active", (file) => {
      currentFile.value = file;
    });

    hooks.hook("file:details:inactive", () => {
      currentFile.value = null;
    });
  };
}
