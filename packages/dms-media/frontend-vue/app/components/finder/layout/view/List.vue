<script setup lang="ts">
import type { TableColumn, TableRow } from "@nuxt/ui";
import type { GhostRefValue } from "../../../../composables/finder/actions/useDraggableItem";
import { FileExplorerItemType } from "../../../../utils/finder/models";
import {
  getItemIcon,
  getItemModifiedLabel,
  getItemPreview,
  getItemSizeLabel,
  getItemTypeLabel,
} from "../../../../utils/finder/helpers";

interface FileExplorerItemProps {
  items: Array<FolderItemPublic | FileItemPublic>;
}

const props = defineProps<FileExplorerItemProps>();

const { t } = useI18n();
const { currentFile, isEdited } = useFinderContext();
const { selectedItems } = useFinderSelect();

const { formatFileSize } = useFinderSize();

const containerRef = useTemplateRef<HTMLElement>("list-container-ref");

const ghostRefsByItemId = ref(new Map<string, GhostRefValue>());

function setRowGhostRef(id: string, el: unknown) {
  if (el) ghostRefsByItemId.value.set(id, el as GhostRefValue);
  else ghostRefsByItemId.value.delete(id);
}

function getGhostRef(id: string) {
  return computed(() => ghostRefsByItemId.value.get(id) ?? null);
}

onBeforeUpdate(() => {
  ghostRefsByItemId.value.clear();
});

const contextMenuTarget = ref<FolderItemPublic | FileItemPublic | null>(null);
const hoveredRow = ref<TableRow<FolderItemPublic | FileItemPublic> | null>(
  null,
);

const hooks = useFinderHooks();
const { handleModifiedClick } = useFinderSelectionClick();

const selectedRow = ref<Record<number, boolean>>({});
const editedName = ref("");

const { contextMenuItems } = useItemContextMenu(contextMenuTarget);

const columns = computed<TableColumn<FolderItemPublic | FileItemPublic>[]>(
  () => [
    { id: "icon", header: "" },
    { id: "name", header: t("dms.finder.table.name") },
    { id: "type", header: t("dms.finder.table.type") },
    { id: "size", header: t("dms.finder.table.size") },
    { id: "modified", header: t("dms.finder.table.modified") },
  ],
);

const clickHandlers = {
  [FileExplorerItemType.File]: (item: FileItemPublic) => {
    hooks.callHook("select:file", item);
    hooks.callHook("file:details:active", item);
  },
  [FileExplorerItemType.Folder]: (item: FolderItemPublic) => {
    hooks.callHook("file:details:active", null);
    hooks.callHook("select:folder", item);
    hooks.callHook("folder:details:activate", item);
  },
};

function itemFromEvent(
  event: Event,
): FolderItemPublic | FileItemPublic | null {
  const target = event.target as HTMLElement | null;
  const row = target?.closest("tbody tr");
  if (!row?.parentElement) return null;
  const index = [...row.parentElement.children].indexOf(row);
  return props.items[index] ?? null;
}

function handleClick(event: MouseEvent) {
  const item = hoveredRow.value?.original ?? itemFromEvent(event);
  if (!item || isEdited(item)) return;

  if (handleModifiedClick(event, item)) return;

  hooks.callHook("select:item:clear");

  const handler = clickHandlers[item.type];

  if (handler) {
    handler(item as never);
  }
}
const dblClickHandlers = {
  [FileExplorerItemType.File]: (item: FileItemPublic) =>
    hooks.callHook("file:preview:open", item),
  [FileExplorerItemType.Folder]: (item: FolderItemPublic) =>
    hooks.callHook("folder:open", item),
};

function handleDoubleClick(event: MouseEvent) {
  const item = hoveredRow.value?.original ?? itemFromEvent(event);
  if (!item || isEdited(item)) return;

  const handler = dblClickHandlers[item.type];

  if (handler) {
    handler(item as never);
  }
}

function handleHover(
  _e: Event,
  row: TableRow<FolderItemPublic | FileItemPublic> | null,
) {
  hoveredRow.value = row;
}

function handleContextMenu(
  _e: Event,
  row: TableRow<FolderItemPublic | FileItemPublic>,
) {
  contextMenuTarget.value = row.original;
}

/* Lifecycle */

function updateSelectedRow() {
  const result: Record<number, boolean> = {};

  selectedItems.value.forEach((selectedItem) => {
    const index = props.items.findIndex((item) => item.id === selectedItem.id);
    if (index >= 0) result[index] = true;
  });

  if (currentFile.value) {
    const isInSelectedItems = selectedItems.value.some(
      (item) => item.id === currentFile.value?.id,
    );
    if (isInSelectedItems) {
      const index = props.items.findIndex(
        (item) =>
          item.type === FileExplorerItemType.File &&
          item.id === currentFile.value?.id,
      );
      if (index >= 0) result[index] = true;
    }
  }

  selectedRow.value = result;
}
useDeselectOnOutsideClick(
  containerRef,
  () => {
    if (selectedItems.value.length === 0) return;
    hooks.callHook("select:item:clear");
  },
  {
    deselect: computed(() => selectedItems.value.length > 0),
  },
);

watch([currentFile, selectedItems], updateSelectedRow, {
  immediate: true,
  deep: true,
});
</script>

<template>
  <FinderComponentsEmpty v-if="items.length === 0" />
  <div
    v-else
    ref="list-container-ref"
    class="max-h-full grow overflow-x-auto overflow-y-auto sm:overflow-x-hidden"
  >
    <UContextMenu :items="contextMenuItems">
      <UTable
        v-model:row-selection="selectedRow"
        :data="items"
        :columns="columns"
        class="select-none"
        :ui="{
          tbody: 'bg-transparent',
          tr: 'transition-colors',
          thead: 'bg-transparent',
          th: 'text-muted py-1.5',
          td: 'py-1.5',
        }"
        sticky
        @click="handleClick"
        @dblclick="handleDoubleClick"
        @hover="handleHover"
        @contextmenu="handleContextMenu"
      >
        <template #icon-cell="{ row }">
          <FinderLayoutViewCardList
            :item="row.original"
            :ghost-ref="getGhostRef(row.original.id)"
          >
            <FinderLayoutViewCardGhost
              :ref="(el) => setRowGhostRef(row.original.id, el)"
              :icon="getItemIcon(row.original)"
              :preview="getItemPreview(row.original)"
            />
            <UAvatar
              :src="getItemPreview(row.original)"
              :alt="row.original.name"
              :icon="getItemIcon(row.original)"
              :ui="{
                root: `rounded-sm size-8 ${row.original.type === FileExplorerItemType.Folder ? 'bg-transparent' : ''}`,
                image: 'object-cover',
                icon: `text-muted ${row.original.type === FileExplorerItemType.Folder ? 'size-6' : ''}`,
              }"
            />
          </FinderLayoutViewCardList>
        </template>
        <template #name-cell="{ row }">
          <FinderLayoutViewCardList
            :item="row.original"
            :ghost-ref="getGhostRef(row.original.id)"
          >
            <FinderLayoutViewCardInput
              v-if="isEdited(row.original)"
              v-model="editedName"
              :item="row.original"
            />
            <span v-else>{{ row.original.name }}</span>
          </FinderLayoutViewCardList>
        </template>
        <template #type-cell="{ row }">
          <FinderLayoutViewCardList
            :item="row.original"
            :ghost-ref="getGhostRef(row.original.id)"
            :text="getItemTypeLabel(row.original, t)"
          />
        </template>
        <template #size-cell="{ row }">
          <FinderLayoutViewCardList
            :item="row.original"
            :ghost-ref="getGhostRef(row.original.id)"
            :text="getItemSizeLabel(row.original, formatFileSize)"
          />
        </template>
        <template #modified-cell="{ row }">
          <FinderLayoutViewCardList
            :item="row.original"
            :ghost-ref="getGhostRef(row.original.id)"
            :text="getItemModifiedLabel(row.original, t)"
          />
        </template>
      </UTable>
    </UContextMenu>
  </div>
</template>

<style scoped>
:deep(tr[data-selected="true"]) {
  background-color: var(--ui-bg-elevated);
}

:deep(tr:hover) {
  background-color: transparent;
}

:deep(tr[data-selected="true"]:hover) {
  background-color: var(--ui-bg-accented);
}

:deep(tr:has([data-drop-target])) {
  background-color: var(--ui-bg-elevated);
}

:deep(td) {
  padding-top: 0.375rem;
  padding-bottom: 0.375rem;
}

:deep(th) {
  padding-top: 0.375rem;
  padding-bottom: 0.375rem;
}
</style>
