import NameDialog from "../../components/dialogs/NameDialog.vue";
import type { MediaAsset, MediaFolder } from "../../types/media";
import type { MediaLibrary, NameOutcome } from "./useMediaLibrary";

function fieldErrorOf(
  write: Promise<NameOutcome>,
): Promise<string | undefined> {
  return write.then((outcome) => outcome.fieldError);
}

/** The commands that ask for a name: a new folder, and the renaming of a file or a folder. */
export function createNamingCommands(
  library: MediaLibrary,
  showLocked: (folder: MediaFolder) => Promise<void>,
) {
  const { t } = library;
  const nameDialog = useOverlay().create(NameDialog);

  function siblingNames(parentId: string | null, exceptId?: string): string[] {
    return library.tree
      .childrenOf(parentId)
      .filter((folder) => folder.id !== exceptId)
      .map((folder) => folder.name);
  }

  function neighbourNames(asset: MediaAsset): string[] {
    const current = library.listing.location.value;
    if (current.kind !== "folder" || current.folderId !== asset.folderId)
      return [];
    return library.listing.assets.value
      .filter((other) => other.id !== asset.id)
      .map((other) => other.name);
  }

  async function newFolder(parentId?: string | null): Promise<void> {
    const parentKey =
      parentId === undefined
        ? (library.currentFolder.value?.id ?? null)
        : parentId;
    const parent = parentKey
      ? library.tree.foldersById.value.get(parentKey)
      : undefined;
    if (parent && !parent.acceptsSubfolders) return showLocked(parent);
    await nameDialog.open({
      title: t("dms_media.dialogs.new_folder.title"),
      description: parent
        ? t("dms_media.dialogs.new_folder.inside", { name: parent.name })
        : t("dms_media.dialogs.new_folder.at_root"),
      icon: "i-ph-folder-plus",
      label: t("dms_media.dialogs.new_folder.label"),
      confirmLabel: t("dms_media.dialogs.new_folder.confirm"),
      takenNames: siblingNames(parentKey),
      submit: (name: string) =>
        fieldErrorOf(
          library.actions.createFolder(name, parentKey ?? undefined),
        ),
    });
  }

  async function renameAsset(asset: MediaAsset): Promise<void> {
    const extension = extensionOf(asset);
    const hasExtension = asset.name.toLowerCase().endsWith(`.${extension}`);
    await nameDialog.open({
      title: t("dms_media.dialogs.rename.title"),
      description: t("dms_media.dialogs.rename.file_description"),
      icon: "i-ph-pencil-simple",
      label: t("dms_media.dialogs.rename.label"),
      initial: baseNameOf(asset),
      suffix: hasExtension ? `.${extension}` : undefined,
      confirmLabel: t("dms_media.dialogs.rename.confirm"),
      takenNames: neighbourNames(asset),
      submit: (name: string) =>
        fieldErrorOf(library.actions.renameAsset(asset, name)),
    });
  }

  async function renameFolder(folder: MediaFolder): Promise<void> {
    if (folder.bound) return showLocked(folder);
    await nameDialog.open({
      title: t("dms_media.dialogs.rename.folder_title"),
      icon: "i-ph-pencil-simple",
      label: t("dms_media.dialogs.rename.label"),
      initial: folder.name,
      confirmLabel: t("dms_media.dialogs.rename.confirm"),
      takenNames: siblingNames(folder.parentId, folder.id),
      submit: (name: string) =>
        fieldErrorOf(library.actions.renameFolder(folder, name)),
    });
  }

  return { newFolder, renameAsset, renameFolder };
}
