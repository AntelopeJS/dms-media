import type { MaybeRefOrGetter } from "vue";
import { toValue } from "vue";

export function useDropTarget(
  folderId: MaybeRefOrGetter<string | null>,
  dropZoneRef?: Ref<HTMLElement | null>,
) {
  const hooks = useFinderHooks();
  const { draggingItems, dropTargetId, isValidDrop } = useFinderDragAndDrop();

  const isDropTarget = computed(() => dropTargetId.value === toValue(folderId));
  const isValidDropTarget = computed(
    () => isDropTarget.value && isValidDrop.value,
  );

  function handleDragOver(event: DragEvent) {
    if (isExternalDrop(event)) return;
    if (toValue(folderId) === null) return;

    event.preventDefault();
    event.stopPropagation();
    dropTargetId.value = toValue(folderId);
  }

  function handleDragLeave() {
    dropTargetId.value = null;
  }

  function handleDrop(event: DragEvent) {
    if (isExternalDrop(event)) return;

    const targetFolderId = toValue(folderId);
    if (targetFolderId === null) return;

    event.preventDefault();
    event.stopPropagation();

    if (draggingItems.value.length === 0 || !isValidDrop.value) return;

    draggingItems.value.forEach((item) => {
      hooks.callHook("finder:move:item", item.id, targetFolderId);
    });
    dropTargetId.value = null;
  }

  function isExternalDrop(event: DragEvent) {
    return event.dataTransfer?.types.includes("Files") ?? false;
  }

  if (dropZoneRef !== undefined) {
    watch(
      dropZoneRef,
      (el, _, onCleanup) => {
        if (!el) return;

        el.addEventListener("dragover", handleDragOver);
        el.addEventListener("dragleave", handleDragLeave);
        el.addEventListener("drop", handleDrop);

        onCleanup(() => {
          el.removeEventListener("dragover", handleDragOver);
          el.removeEventListener("dragleave", handleDragLeave);
          el.removeEventListener("drop", handleDrop);
        });
      },
      { immediate: true },
    );

    return { isValidDropTarget };
  }

  return {
    isDropTarget,
    isValidDropTarget,
    handlers: {
      onDragover: handleDragOver,
      onDragleave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}
