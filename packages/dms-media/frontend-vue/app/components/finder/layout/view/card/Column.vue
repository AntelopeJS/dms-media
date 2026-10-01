<script setup lang="ts">
import { tv } from "tailwind-variants";
import { FileExplorerItemType } from "../../../../../utils/finder/models";

interface Props {
  item: FileItemPublic | FolderItemPublic;
}

const props = defineProps<Props>();

const { isEdited } = useFinderContext();
const { isItemSelected } = useFinderSelect();
const hooks = useFinderHooks();
const { handleModifiedClick } = useFinderSelectionClick();

const editedName = ref("");
const target = useTemplateRef<HTMLElement>("item-card-ref");

const { formatFileSize } = useFinderSize();

const { contextMenuItems } = useItemContextMenu(() => props.item);
const itemIcon = computed(() => getItemIcon(props.item));
const itemPreview = computed(() => getItemPreview(props.item));
const folderId = computed(() => getItemFolderId(props.item));

const formattedSize = computed(() => {
  if (props.item.type === FileExplorerItemType.File) {
    return formatFileSize((props.item as FileItemPublic).size);
  }
  return "";
});

const itemState = computed(() => {
  const isFile = props.item.type === FileExplorerItemType.File;
  const isSelected = isItemSelected(props.item);
  const isBeingEdited = isEdited(props.item);
  const isEnhanced = isSelected || isBeingEdited;

  return {
    isFile,
    isSelected,
    isBeingEdited,
    isEnhanced,
  };
});

const ghostRef = useTemplateRef<HTMLElement>("drag-ghost");
const { isDragged, handlers: dragHandlers } = useDraggableItem(
  props.item,
  ghostRef,
);
const { isValidDropTarget } = useDropTarget(folderId.value, target);

const theme = tv({
  slots: {
    root: "",
    base: "justify-start",
    leadingIcon: "",
  },
  variants: {
    selected: {
      true: { root: "", leadingIcon: "text-primary" },
      false: { root: "", leadingIcon: "" },
    },
    dragged: {
      true: { root: "scale-95 opacity-50" },
      false: { root: "" },
    },
    dropTarget: {
      true: { root: "bg-elevated" },
      false: { root: "" },
    },
  },
  defaultVariants: {
    selected: false,
    dragged: false,
    dropTarget: false,
  },
});

const ui = computed(() =>
  theme({
    selected: itemState.value.isSelected,
    dragged: isDragged.value,
    dropTarget: isValidDropTarget.value,
  }),
);

const buttonUi = computed(() => ({
  base: ui.value.base(),
  leadingIcon: ui.value.leadingIcon(),
}));

const clickHandlers = {
  [FileExplorerItemType.File]: (item: FileItemPublic) => {
    hooks.callHook("select:file", item);
    hooks.callHook("file:details:active", item);
  },
  [FileExplorerItemType.Folder]: (item: FolderItemPublic) => {
    hooks.callHook("file:details:active", null);
    hooks.callHook("folder:open", item);
    hooks.callHook("select:folder", item);
    hooks.callHook("folder:details:activate", item);
  },
};

function handleClick(event: MouseEvent) {
  if (handleModifiedClick(event, props.item)) return;

  hooks.callHook("select:item:clear");

  const handler = clickHandlers[props.item.type];
  if (handler) {
    handler(props.item as never);
  }
}

function handleDoubleClick() {
  if (props.item.type !== FileExplorerItemType.File) return;
  hooks.callHook("file:preview:open", props.item as FileItemPublic);
}

useDeselectOnOutsideClick(
  target,
  () => {
    if (!itemState.value.isSelected) return;
    hooks.callHook("deselect:item", props.item);
  },
  {
    deselect: computed(() => itemState.value.isSelected),
  },
);
</script>

<template>
  <div ref="item-card-ref" v-bind="dragHandlers" class="select-none">
    <FinderLayoutViewCardGhost
      ref="drag-ghost"
      :icon="itemIcon"
      :preview="itemPreview"
    />
    <UContextMenu :items="contextMenuItems">
      <UButton
        variant="ghost"
        color="neutral"
        block
        :icon="itemIcon"
        :trailing-icon="
          item.type === FileExplorerItemType.Folder
            ? 'i-heroicons-chevron-right'
            : undefined
        "
        :class="ui.root()"
        :ui="buttonUi"
        :style="
          itemState.isSelected
            ? { backgroundColor: 'var(--ui-bg-elevated)' }
            : undefined
        "
        @click="handleClick"
        @dblclick="handleDoubleClick"
      >
        <div class="min-w-0 flex-1 text-left">
          <FinderLayoutViewCardInput
            v-if="itemState.isBeingEdited"
            v-model="editedName"
            :item="item"
          />
          <template v-else>
            <p class="truncate">{{ item.name }}</p>
            <p
              v-if="itemState.isFile"
              class="text-muted truncate text-xs font-normal"
            >
              {{ formattedSize }}
            </p>
          </template>
        </div>
      </UButton>
    </UContextMenu>
  </div>
</template>
