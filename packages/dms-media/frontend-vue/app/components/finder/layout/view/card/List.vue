<script setup lang="ts">
import type { GhostRefValue } from "../../../../../composables/finder/actions/useDraggableItem";
import { useRowDragState } from "../../../../../composables/finder/actions/useRowDragState";

interface Props {
  item: FileItemPublic | FolderItemPublic;
  ghostRef: MaybeRef<GhostRefValue>;
  text?: string;
}

const props = defineProps<Props>();

const { isValidDropTarget, dragClasses, handlers } = useRowDragState(
  props.item,
  toRef(() => unref(props.ghostRef)),
);
</script>

<template>
  <div
    :class="dragClasses"
    :data-drop-target="isValidDropTarget ? '' : undefined"
    v-bind="handlers"
  >
    <slot>
      <span>{{ text }}</span>
    </slot>
  </div>
</template>
