import type { ComputedRef, MaybeRefOrGetter, Ref } from "vue";
import { FileExplorerItemType } from "../../../utils/finder/models";
import { createMenuBuilder, type HookMapping } from "./useContextMenu";

type FinderItem = FileItemPublic | FolderItemPublic;
type TranslateFunction = ReturnType<typeof useI18n>["t"];
type HooksType = ReturnType<typeof useFinderHooks>;

/**
 * Creates a context menu for a given item
 * @param item - The item to create a context menu for
 * @returns The context menu items
 */
export function useItemContextMenu(item: MaybeRefOrGetter<FinderItem | null>) {
  const { t } = useI18n();
  const { favoriteFolderIds } = useFavoritesFolder();
  const hooks = useFinderHooks();

  const itemRef = computed(() => toValue(item));

  const fileMenuItems = buildFileMenu(itemRef, hooks, t);
  const folderMenuItems = buildFolderMenu(itemRef, hooks, t, favoriteFolderIds);

  const contextMenuItems = computed(() => {
    const current = itemRef.value;
    if (!current) return [];
    return current.type === FileExplorerItemType.File
      ? fileMenuItems.value
      : folderMenuItems.value;
  });

  return { contextMenuItems };
}

/* File Menu */
function buildFileMenu(
  itemRef: ComputedRef<FinderItem | null>,
  hooks: HooksType,
  t: TranslateFunction,
) {
  const fileRef = computed(() =>
    itemRef.value?.type === FileExplorerItemType.File
      ? (itemRef.value as FileItemPublic)
      : null,
  );

  const map: HookMapping = {
    open: "file:preview:open",
    download: "file:download",
    rename: "file:rename",
    delete: "file:delete",
    share: "file:share",
    details: "file:details:active",
    update: "file:update",
    editImage: "file:edit-image",
  };

  return createMenuBuilder<FileItemPublic>(fileRef, hooks, map, t)
    .group(
      [
        "open",
        (f) => ({ disabled: !PREVIEWABLE_TYPES.includes(f?.mimetype ?? "") }),
      ],
      "rename",
      [
        "editImage",
        (f) => ({ disabled: !isEditableImageMimetype(f?.mimetype ?? "") }),
      ],
    )
    .group("download", "share")
    .group(["delete", { color: Color.error }])
    .build();
}

/* Folder Menu */
function buildFolderMenu(
  itemRef: ComputedRef<FinderItem | null>,
  hooks: HooksType,
  t: TranslateFunction,
  favoriteFolderIds: Ref<string[]>,
) {
  const folderRef = computed(() =>
    itemRef.value?.type === FileExplorerItemType.Folder
      ? (itemRef.value as FolderItemPublic)
      : null,
  );

  const map: HookMapping = {
    open: "folder:open",
    rename: "folder:rename",
    delete: "folder:delete",
    newFolder: "folder:new",
    toggleFavorite: "folder:toggleFavorite",
    update: "folder:update",
  };

  return createMenuBuilder<FolderItemPublic>(folderRef, hooks, map, t)
    .group("open", "rename")
    .group("newFolder")
    .group("delete")
    .group([
      "toggleFavorite",
      (f) => {
        const isFav = favoriteFolderIds.value.includes(f.id);
        return {
          label: isFav
            ? t("dms.finder.actions.remove_from_favorites")
            : t("dms.finder.actions.add_to_favorites"),
          icon: isFav ? "i-heroicons-star-solid" : "i-heroicons-star",
        };
      },
    ])
    .build();
}
