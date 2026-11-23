import type { FolderVisibility, MediaFolder } from "../../types/media";
import type { NameOutcome } from "../../composables/library/useMediaLibrary";
import type { RequestError } from "../../utils/httpStatus";
import type { LibraryCore } from "./libraryCore";

const NAME_FIELD = "name";
const NAME_ERROR_CODES: Record<string, typeof NAME_FIELD> = Object.fromEntries(
  [
    "name_required",
    "name_too_long",
    "name_forbidden",
    "name_taken",
    "folder_name_taken",
  ].map((code) => [`$dms_media.errors.${code}`, NAME_FIELD]),
);

type Translate = LibraryCore["t"];

/** A refusal about the typed name, shown under the name field instead of a toast. */
export function nameFieldError(
  t: Translate,
  error: RequestError,
): string | undefined {
  const [refusal] = resolveFieldErrors(error, {
    fields: [NAME_FIELD],
    codes: NAME_ERROR_CODES,
  }).fields;
  return refusal && resolveApiMessage(t, refusal.message, refusal.params);
}

/** The writes on folders: creating, renaming, moving, deleting and their visibility. */
export function createFolderActions(library: LibraryCore) {
  const { api, tree, t } = library;

  function failName(error: RequestError, titleKey: string): NameOutcome {
    const fieldError = nameFieldError(t, error);
    if (!fieldError) library.notifyFailure(error, titleKey);
    return { isDone: false, fieldError };
  }

  async function createFolder(
    name: string,
    parentId?: string,
  ): Promise<NameOutcome> {
    try {
      const { id } = await api.createFolder(name, parentId);
      await tree.refresh();
      library.toast.add({
        title: t("dms_media.toasts.folder_created", { name }),
        color: "success",
        icon: "i-ph-folder-plus",
      });
      return { isDone: true, id };
    } catch (error) {
      return failName(error, "dms_media.toasts.folder_create_failed");
    }
  }

  async function renameFolder(
    folder: MediaFolder,
    name: string,
  ): Promise<NameOutcome> {
    if (!name || name === folder.name) return { isDone: true };
    try {
      await api.renameFolder(folder.id, name);
      tree.patchFolder(folder.id, { name });
      return { isDone: true };
    } catch (error) {
      return failName(error, "dms_media.toasts.rename_failed");
    }
  }

  async function moveFolder(
    folder: MediaFolder,
    parentId: string | null,
  ): Promise<void> {
    try {
      await api.moveFolder(folder.id, parentId);
      await tree.refresh();
      library.toast.add({
        title: t("dms_media.toasts.folder_moved", { name: folder.name }),
        color: "success",
      });
    } catch (error) {
      library.notifyFailure(error, "dms_media.toasts.move_failed");
    }
  }

  async function deleteFolder(folder: MediaFolder): Promise<void> {
    try {
      await api.deleteFolder(folder.id);
      if (library.currentFolder.value?.id === folder.id)
        await library.openFolder(folder.parentId);
      await tree.refresh();
      library.toast.add({
        title: t("dms_media.toasts.folder_deleted", { name: folder.name }),
        color: "success",
        icon: "i-ph-trash",
      });
    } catch (error) {
      library.notifyFailure(error, "dms_media.toasts.delete_failed");
    }
  }

  async function setFolderVisibility(
    folder: MediaFolder,
    visibility: FolderVisibility,
  ): Promise<void> {
    tree.patchFolder(folder.id, { visibility });
    try {
      await api.setFolderVisibility(folder.id, visibility);
      await library.listing.load();
      library.toast.add({
        title: t(`dms_media.toasts.folder_visibility.${visibility}`, {
          name: folder.name,
        }),
        color: "success",
        icon: VISIBILITY_ICONS[visibility],
      });
    } catch (error) {
      tree.patchFolder(folder.id, { visibility: folder.visibility });
      library.notifyFailure(error, "dms_media.toasts.visibility_failed");
    }
  }

  return {
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    setFolderVisibility,
  };
}
