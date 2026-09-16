<script setup lang="ts">
interface FileExplorerItemProps {
  items: Array<FolderItemPublic | FileItemPublic>;
}

const props = defineProps<FileExplorerItemProps>();

const { gridStyle } = useFinderLayout();
/*
TODO: Waiting for advanced drag & drop (hover over a folder to open it and drop files inside).
const { openedFolder } = useFinderContext();

const gridRef = useTemplateRef<HTMLElement>("grid-ref");
const currentFolderId = computed(() => openedFolder.value?.id ?? null);
const { isValidDropTarget } = useDropTarget(currentFolderId, gridRef);

*/
const itemsLength = computed(() => props.items.length);

const containerClasses = computed(() => [
  // "bg-elevated": isValidDropTarget.value, // Waiting advanced drag & drop to be implemented.
  "select-none overflow-y-auto h-full",
]);
</script>

<template>
  <div ref="grid-ref" :class="containerClasses">
    <FinderComponentsEmpty v-if="itemsLength === 0" />
    <div v-else class="place-items-center gap-4 pb-6 sm:p-6" :style="gridStyle.layout">
      <FinderLayoutViewCardGrid
        v-for="item in items"
        :key="item.id"
        :data="item"
      />
    </div>
  </div>
</template>
