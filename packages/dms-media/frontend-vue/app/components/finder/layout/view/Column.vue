<script setup lang="ts">
type MockItem = FileItemPublic | FolderItemPublic;

interface ColumnData {
  title: string;
  items: MockItem[];
  folderId: string | null;
}

const columnPath = ref<string[]>([]);
const scrollContainerRef = ref<HTMLDivElement | null>(null);

const { t } = useI18n();
const { openedFolder } = useFinderContext();
const { map, root, getSubfoldersFromFolderId, getFilesFromFolderId } =
  useFinderStore();
const { draggingItems, dropTargetId, isValidDrop } = useFinderDragAndDrop();
const { selectedItems } = useFinderSelect();
const hooks = useFinderHooks();

const columns = computed<ColumnData[]>(() => {
  const result: ColumnData[] = [
    {
      title: t("dms.finder.column.folders"),
      items: root.value.entries,
      folderId: null,
    },
  ];

  for (const folderId of columnPath.value) {
    const folder = map.value.folders.get(folderId);
    if (!folder) continue;

    result.push({
      title: folder.name ?? "",
      folderId,
      items: [
        ...getSubfoldersFromFolderId(folderId),
        ...getFilesFromFolderId(folderId),
      ],
    });
  }

  return result;
});

function buildPathToFolder(folderId: string | null): string[] {
  if (!folderId) return [];

  const folder = map.value.folders.get(folderId);
  if (!folder) return [];

  return folder.path;
}

function getColumnDescription(items: MockItem[]): string {
  return t(
    "dms.finder.column.elements_count",
    { count: items.length },
    items.length,
  );
}

function isColumnDropTarget(folderId: string | null): boolean {
  return dropTargetId.value === folderId && isValidDrop.value;
}

function getColumnClasses(folderId: string | null): string[] {
  const baseClasses = [
    "data-finder-card-item",
    "flex-1",
    "space-y-1",
    "overflow-y-auto",
    "p-2",
  ];
  if (isColumnDropTarget(folderId)) {
    baseClasses.push("bg-elevated/50");
  }
  return baseClasses;
}

function handleColumnDragOver(event: DragEvent, folderId: string | null) {
  if (event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  dropTargetId.value = folderId;
}

function handleColumnDragLeave() {
  dropTargetId.value = null;
}

function handleColumnDrop(event: DragEvent, folderId: string | null) {
  if (event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();

  if (draggingItems.value.length === 0 || !isValidDrop.value) return;

  draggingItems.value.forEach((item) => {
    hooks.callHook("finder:move:item", item.id, folderId);
  });
  dropTargetId.value = null;
}

watch(
  openedFolder,
  (newFolder) => {
    if (!newFolder) return;

    const newPath = buildPathToFolder(newFolder.id);
    const isSamePath =
      columnPath.value.length === newPath.length &&
      columnPath.value.every((id, idx) => id === newPath[idx]);

    if (isSamePath) return;

    columnPath.value = newPath;
  },
  { immediate: true },
);

watch(
  () => columnPath.value,
  () => {
    nextTick(() => {
      const container = scrollContainerRef.value;
      if (!container) return;
      container.scrollLeft = container.scrollWidth;
    });
  },
);

useDeselectOnOutsideClick(
  scrollContainerRef,
  () => {
    hooks.callHook("select:item:clear");
  },
  {
    deselect: computed(() => selectedItems.value.length > 0),
  },
);
</script>

<template>
  <div
    ref="scrollContainerRef"
    class="bg-accented/5 flex size-full overflow-x-auto overflow-y-hidden"
  >
    <FinderCorePanel
      v-for="(column, columnIndex) in columns"
      :key="columnIndex"
      :min-width="280"
      :max-width="400"
      :prefered-width="320"
    >
      <div class="flex h-full flex-col overflow-hidden select-none">
        <div class="border-default shrink-0 border-b px-4 py-3">
          <h3 class="truncate text-sm font-medium">{{ column.title }}</h3>
          <p class="text-muted mt-0.5 text-xs">
            {{ getColumnDescription(column.items) }}
          </p>
        </div>

        <div
          :class="getColumnClasses(column.folderId)"
          @dragover="handleColumnDragOver($event, column.folderId)"
          @dragleave="handleColumnDragLeave"
          @drop="handleColumnDrop($event, column.folderId)"
        >
          <FinderComponentsEmpty v-if="column.items.length === 0" />

          <FinderLayoutViewCardColumn
            v-for="item in column.items"
            :key="item.id"
            :item="item"
          />
        </div>
      </div>
    </FinderCorePanel>
  </div>
</template>
