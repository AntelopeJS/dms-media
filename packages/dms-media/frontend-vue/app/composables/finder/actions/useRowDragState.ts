import type { FileExplorerItemPublic } from "../../../utils/finder/models";
import { FileExplorerItemType } from "../../../utils/finder/models";
import { useDraggableItem, type GhostRefValue } from "./useDraggableItem";

export function useRowDragState(
  item: FileExplorerItemPublic,
  ghostRef?: Ref<GhostRefValue>,
) {
  const { isDragged, handlers: dragHandlers } = useDraggableItem(
    item,
    ghostRef,
  );

  const folderId = item.type === FileExplorerItemType.Folder ? item.id : null;
  const {
    isDropTarget,
    isValidDropTarget,
    handlers: dropHandlers,
  } = useDropTarget(folderId);

  const dragClasses = computed(() => {
    const baseClasses = ["transition-all"];
    if (isDragged.value) {
      baseClasses.push("opacity-50");
    }
    return baseClasses;
  });

  const handlers = {
    ...dragHandlers,
    onDragover: (e: DragEvent) => {
      if (item.type === FileExplorerItemType.Folder) {
        dropHandlers?.onDragover(e);
      }
    },
    onDragleave: dropHandlers?.onDragleave,
    onDrop: dropHandlers?.onDrop,
  };

  return {
    isDragged,
    isDropTarget,
    isValidDropTarget,
    dragClasses,
    handlers,
  };
}
