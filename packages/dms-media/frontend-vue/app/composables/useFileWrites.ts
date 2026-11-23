import type { AssetDetails, AssetVisibility, MediaAsset } from "../types/media";

/** What the writes on a file read of it, and how they show a write at once and read the file again. */
export interface FileWritesSource {
  asset: ComputedRef<AssetDetails["asset"] | undefined>;
  load: (rereadSiblings?: boolean) => Promise<void>;
  patch: (changes: Partial<MediaAsset>) => void;
}

/** The writes on the file a page shows: its name, alt text, visibility, folder and deletion. */
export function useFileWrites({ asset, load, patch }: FileWritesSource) {
  const api = useMediaApi();
  const { t } = useI18n();
  const toast = useToast();
  const errors = useApiErrorPresenter();

  async function rename(name: string): Promise<boolean> {
    const current = asset.value;
    if (!current || !name || name === current.name) return false;
    patch({ name });
    try {
      await api.updateAsset(current.id, { name });
      await load(true);
      return true;
    } catch (cause) {
      patch({ name: current.name });
      errors.presentError(cause, {
        fallbackKey: "dms_media.toasts.rename_failed",
      });
      return false;
    }
  }

  async function setAlt(alt: string): Promise<boolean> {
    const current = asset.value;
    if (!current) return false;
    try {
      await api.updateAsset(current.id, { alt });
      patch({ alt });
      return true;
    } catch (cause) {
      errors.presentError(cause, {
        fallbackKey: "dms_media.toasts.alt_failed",
      });
      return false;
    }
  }

  async function applyVisibility(
    id: string,
    visibility: AssetVisibility,
  ): Promise<boolean> {
    try {
      const outcome = await api.setAssetsVisibility([id], visibility);
      if (outcome.refused.length)
        throw { data: { message: outcome.refused[0]?.message } };
      await load();
      return true;
    } catch (cause) {
      errors.presentError(cause, {
        fallbackKey: "dms_media.toasts.visibility_failed",
      });
      return false;
    }
  }

  async function setVisibility(visibility: AssetVisibility): Promise<void> {
    const current = asset.value;
    if (!current || !(await applyVisibility(current.id, visibility))) return;
    toast.add({
      title: t("dms_media.file.visibility_saved"),
      color: "success",
      icon: "i-ph-check-circle",
      actions: [
        {
          label: t("dms_media.actions.undo"),
          onClick: () => void applyVisibility(current.id, current.visibility),
        },
      ],
    });
  }

  async function move(folderId: string): Promise<void> {
    const current = asset.value;
    if (!current) return;
    try {
      const outcome = await api.moveAssets([current.id], folderId);
      if (outcome.refused.length)
        throw { data: { message: outcome.refused[0]?.message } };
      await load();
      toast.add({
        title: t("dms_media.toasts.moved", { count: 1 }, 1),
        color: "success",
      });
    } catch (cause) {
      errors.presentError(cause, {
        fallbackKey: "dms_media.toasts.move_failed",
      });
    }
  }

  async function remove(): Promise<boolean> {
    const current = asset.value;
    if (!current) return false;
    try {
      const outcome = await api.deleteAssets([current.id]);
      if (outcome.refused.length)
        throw { data: { message: outcome.refused[0]?.message } };
      toast.add({
        title: t("dms_media.toasts.deleted", { count: 1 }, 1),
        color: "success",
        icon: "i-ph-trash",
      });
      return true;
    } catch (cause) {
      errors.presentError(cause, {
        fallbackKey: "dms_media.toasts.delete_failed",
      });
      return false;
    }
  }

  return { rename, setAlt, setVisibility, move, remove };
}
