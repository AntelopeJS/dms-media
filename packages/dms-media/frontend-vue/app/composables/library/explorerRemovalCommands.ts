import DeleteFilesDialog from "../../components/dialogs/DeleteFilesDialog.vue";
import VisibilityDialog from "../../components/dialogs/VisibilityDialog.vue";
import type { MediaAsset, MediaFolder } from "../../types/media";
import type { ExplorerAccess } from "./explorerAccess";
import type { MediaLibrary } from "./useMediaLibrary";

/** The commands that delete files or a folder, or change who may read them. */
export function createRemovalCommands(
  library: MediaLibrary,
  access: ExplorerAccess,
  showLocked: (folder: MediaFolder) => Promise<void>,
) {
  const overlay = useOverlay();
  const { confirm } = useConfirm();
  const { t } = library;
  const format = useMediaFormat();
  const deleteDialog = overlay.create(DeleteFilesDialog);
  const visibilityDialog = overlay.create(VisibilityDialog);

  async function deleteAssets(assets: MediaAsset[]): Promise<void> {
    if (assets.length === 0) return;
    const choice = await deleteDialog.open({
      assets,
      canMakePrivate: assets.every(access.canChangeVisibility),
    });
    if (choice === "delete") await library.actions.deleteAssets(assets);
    if (choice !== "private") return;
    const publicAssets = assets.filter(
      (asset) => asset.effectiveVisibility === "public",
    );
    await library.actions.setAssetsVisibility(
      publicAssets,
      "private",
      "dms_media.toasts.made_private_instead",
    );
  }

  async function changeVisibility(assets: MediaAsset[]): Promise<void> {
    if (assets.length === 0) return;
    const visibility = await visibilityDialog.open({
      count: assets.length,
      current: sharedValue(assets.map((asset) => asset.visibility)),
      folderVisibility: sharedValue(
        assets.map((asset) => access.folderOf(asset)?.visibility),
      ),
    });
    if (visibility)
      await library.actions.setAssetsVisibility(assets, visibility);
  }

  async function changeFolderVisibility(folder: MediaFolder): Promise<void> {
    if (!access.canChangeFolderVisibility(folder)) return;
    const visibility = await visibilityDialog.open({
      folderName: folder.name,
      current: folder.visibility,
    });
    if (visibility === "private" || visibility === "public")
      await library.actions.setFolderVisibility(folder, visibility);
  }

  async function deleteFolder(folder: MediaFolder): Promise<void> {
    if (folder.bound) return showLocked(folder);
    const impact = await library.api.folderImpact(folder.id);
    await confirm({
      title: t("dms_media.dialogs.delete_folder.title", { name: folder.name }),
      description: t("dms_media.dialogs.delete_folder.description"),
      color: "error",
      icon: "i-ph-trash",
      confirmLabel: t("dms_media.dialogs.delete_folder.confirm"),
      confirmText: folder.name,
      impact: [
        {
          icon: "i-ph-folders",
          label: t("dms_media.dialogs.delete_folder.subfolders"),
          count: impact.subfolders,
        },
        {
          icon: "i-ph-files",
          label: t("dms_media.dialogs.delete_folder.files"),
          count: impact.files,
        },
        {
          icon: "i-ph-hard-drives",
          label: t("dms_media.dialogs.delete_folder.freed"),
          count: format.formatBytes(impact.size),
        },
        ...(impact.publicFiles > 0
          ? [
              {
                icon: "i-ph-globe",
                label: t("dms_media.dialogs.delete_folder.public_files"),
                count: impact.publicFiles,
              },
            ]
          : []),
      ],
      blocked: impact.linkedSubfolders > 0,
      onConfirm: async () => {
        await library.actions.deleteFolder(folder);
      },
    });
  }

  return {
    deleteAssets,
    changeVisibility,
    changeFolderVisibility,
    deleteFolder,
  };
}
