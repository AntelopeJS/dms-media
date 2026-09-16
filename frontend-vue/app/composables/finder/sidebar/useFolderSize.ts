import { formatFileSize } from "../../../utils/finder/filesize";
import { FileExplorerItemType } from "../../../utils/finder/models";

export function useFinderSize() {
  const { map, root } = useFinderStore();
  const { openedFolder } = useFinderContext();

  const folderSize = computed(() => {
    let size = 0;

    if (!openedFolder.value) {
      for (const item of root.value.entries) {
        size += handleGetFolderSize(item.id);
      }
    } else {
      size = handleGetFolderSize(openedFolder.value.id);
    }

    return formatFileSize(size);
  });

  const elementsCount = computed(() =>
    !openedFolder.value
      ? root.value.entries.length
      : openedFolder.value?.childrenIds.length,
  );

  function handleGetFolderSize(id: string) {
    const item = map.value.entries.get(id);

    if (!item) return 0;

    if (item.type === FileExplorerItemType.File) return item.size;

    let size = 0;
    for (const childId of item.childrenIds) {
      if (!childId) continue;
      size += handleGetFolderSize(childId);
    }

    return size;
  }

  return {
    folderSize,
    elementsCount,
    formatFileSize,
  };
};
