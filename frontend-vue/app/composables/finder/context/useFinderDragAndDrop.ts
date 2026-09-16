import type { FileExplorerItemPublic } from "../../../utils/finder/models";
import { FileExplorerItemType } from "../../../utils/finder/models";

interface Context {
  draggingItems: Ref<FileExplorerItemPublic[]>;
  dropTargetId: Ref<string | null>;
  isDragging: ComputedRef<boolean>;
  isValidDrop: ComputedRef<boolean>;
  draggingCount: ComputedRef<number>;
}

const SYMBOL: InjectionKey<Context> = Symbol("finder-drag-and-drop");

export function useProvideFinderDragAndDrop() {
  const { map } = useFinderStore();

  const draggingItems = ref<FileExplorerItemPublic[]>([]);
  const dropTargetId = ref<string | null>(null);

  const isDragging = computed(() => draggingItems.value.length > 0);
  const draggingCount = computed(() => draggingItems.value.length);

  const isValidDrop = computed(() => {
    if (draggingItems.value.length === 0) return false;

    const targetFolderId = dropTargetId.value;

    return draggingItems.value.every((item) =>
      isValidDropForItem(item, targetFolderId, map.value.folders),
    );
  });

  const context: Context = {
    draggingItems,
    dropTargetId,
    isDragging,
    isValidDrop,
    draggingCount,
  };

  provide(SYMBOL, context);
}

function isValidDropForItem(
  item: FileExplorerItemPublic,
  targetFolderId: string | null,
  mapFolders: Map<string, FolderItemPublic>,
): boolean {
  const sourceFolderId = item.ancestor;

  if (sourceFolderId === targetFolderId) return false;
  if (item.type === FileExplorerItemType.Folder && targetFolderId === item.id)
    return false;
  if (item.type === FileExplorerItemType.Folder && targetFolderId !== null) {
    const folder = mapFolders.get(targetFolderId);
    if (folder && folder.ancestors.includes(item.id)) return false;
  }

  return true;
}

export const useFinderDragAndDrop = () =>
  injectContext<Context>(SYMBOL, {
    contextName: "FinderDragAndDrop",
    providerName: "useProvideFinderDragAndDrop",
  });
