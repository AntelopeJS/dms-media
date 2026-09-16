<script setup lang="ts">
import { useDropZone } from "@vueuse/core";

import { buildFinderShortcuts } from "../../../../utils/finder/shortcuts";

const { t } = useI18n();
const { getSubfoldersFromFolderId, getFilesFromFolderId } = useFinderStore();
const { is } = useFinderLayout();
const { openedFolder } = useFinderContext();
const { contextMenuItems } = useFinderContextMenu();
const { clearSelection } = useFinderSelect();
const hooks = useFinderHooks();

const { isDragging } = useFinderDragAndDrop();
const { onProcessFiles } = useFinderUpload();

const dropZoneRef = useTemplateRef<HTMLElement>("drop-zone");
const { isOverDropZone } = useDropZone(dropZoneRef, {
  onDrop: (files) => {
    if (files?.length) onProcessFiles(files);
  },
});

const allItems = computed(() => {
  const id = openedFolder.value?.id;

  const subfolders = getSubfoldersFromFolderId(id);
  const files = getFilesFromFolderId(id);

  return [...subfolders, ...files];
});

const isExternalDrop = computed(
  () => !isDragging.value && isOverDropZone.value,
);

function selectAll() {
  hooks.callHook("select:item:all", allItems.value);
}

defineShortcuts(
  buildFinderShortcuts({
    selectAll,
    clearSelection,
  }),
);

watch(isDragging, (dragging) => {
  if (!dragging) {
    isOverDropZone.value = false;
  }
});
</script>

<template>
  <div ref="drop-zone" class="min-size-0 max-w-full grow overflow-hidden">
    <UContextMenu :items="contextMenuItems" class="min-size-0 max-w-full">
      <FinderLayoutViewGrid v-if="is.grid" :items="allItems" />
      <FinderLayoutViewList v-if="is.list" :items="allItems" />
      <FinderLayoutViewColumn v-if="is.columns" />
    </UContextMenu>

    <Transition name="fade">
      <div
        v-if="isExternalDrop"
        class="bg-primary/10 border-primary/80 pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 border-2 border-dashed backdrop-blur-xs"
      >
        <UAvatar
          icon="i-lucide-upload"
          :ui="{
            root: 'rounded-full size-12 bg-primary',
            image: 'object-cover',
            icon: 'text-default',
          }"
        />
        <p class="text-default">{{ t("dms.finder.drop_zone") }}</p>
      </div>
    </Transition>
  </div>
</template>
