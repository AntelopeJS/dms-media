import type { ComponentPublicInstance, Ref } from "vue";
import { unref } from "vue";
import type { FileExplorerItemPublic } from "../../../utils/finder/models";

const MIME_TYPE = "application/finder-item";

export type GhostRefValue = HTMLElement | ComponentPublicInstance | null;

function resolveGhostElement(value: GhostRefValue): HTMLElement | null {
  if (!value) return null;
  if (value instanceof HTMLElement) return value;
  const comp = value as ComponentPublicInstance & {
    root?: Ref<HTMLElement | null>;
  };
  if (comp.$el instanceof HTMLElement) return comp.$el;
  if (comp.root != null) return unref(comp.root);
  return null;
}

export function useDraggableItem(
  item: FileExplorerItemPublic,
  ghostRef?: Ref<GhostRefValue>,
) {
  const { draggingItems } = useFinderDragAndDrop();
  const { selectedItems, isItemSelected } = useFinderSelect();

  const isDragged = computed(() =>
    draggingItems.value.some((dragged) => dragged.id === item.id),
  );

  function handleStart(event: DragEvent) {
    event.dataTransfer!.effectAllowed = "move";

    const itemsToDrag = buildDragList(
      item,
      selectedItems.value,
      isItemSelected,
    );
    const itemIds = itemsToDrag.map((i) => i.id).join(",");

    event.dataTransfer!.setData(MIME_TYPE, itemIds);

    const ghostElement = ghostRef?.value
      ? resolveGhostElement(ghostRef.value)
      : null;
    if (
      ghostElement instanceof HTMLElement &&
      typeof ghostElement.cloneNode === "function"
    ) {
      const clonedGhost = ghostElement.cloneNode(true) as HTMLElement;

      clonedGhost.style.position = "fixed";
      clonedGhost.style.top = "-9999px";
      clonedGhost.style.left = "-9999px";
      clonedGhost.style.visibility = "visible";
      clonedGhost.style.opacity = "1";
      clonedGhost.style.pointerEvents = "none";
      clonedGhost.style.zIndex = "9999";

      updateGhostCount(clonedGhost, itemsToDrag.length);

      document.body.appendChild(clonedGhost);
      event.dataTransfer!.setDragImage(clonedGhost, 0, 0);

      requestAnimationFrame(() => {
        document.body.removeChild(clonedGhost);
      });
    }

    draggingItems.value = itemsToDrag;
  }

  function handleEnd() {
    draggingItems.value = [];
  }

  return {
    isDragged,
    handlers: {
      draggable: true,
      onDragstart: handleStart,
      onDragend: handleEnd,
    },
  };
}

function buildDragList(
  draggedItem: FileExplorerItemPublic,
  selectedItems: FileExplorerItemPublic[],
  isItemSelected: (item: FileExplorerItemPublic) => boolean,
): FileExplorerItemPublic[] {
  if (isItemSelected(draggedItem) && selectedItems.length > 0) {
    return selectedItems;
  }
  return [draggedItem];
}

function updateGhostCount(ghost: HTMLElement, count: number): void {
  const chipElement = ghost.querySelector('[data-slot="chip"]');
  if (!chipElement) return;
  chipElement.textContent = count.toString();
}
