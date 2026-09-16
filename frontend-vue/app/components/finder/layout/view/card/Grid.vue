<script setup lang="ts">
import { tv } from "tailwind-variants";
import { FileExplorerItemType } from "../../../../../utils/finder/models";

const theme = tv({
  slots: {
    root: [
      "data-finder-card-item aspect-square",
      "flex flex-col justify-center gap-y-1.5",
      "rounded-sm @[90px]:rounded-md @[90px]:p-2 @[160px]:p-4",
    ].join(" "),
    avatarRoot:
      "size-full shrink rounded-lg bg-transparent p-1 @[90px]:p-1.5 transition-colors",
    avatarImage: "object-cover aspect-square rounded-md",
    avatarIcon: "text-muted aspect-square size-2/3",
  },
  variants: {
    enhanced: {
      true: {
        avatarRoot: "bg-accented/60",
      },
      false: { root: "", avatarRoot: "" },
    },
    dragged: {
      true: { root: "opacity-50 scale-95" },
      false: { root: "" },
    },
    dropTarget: {
      true: { root: "bg-accented" },
      false: { root: "" },
    },
    itemType: {
      file: { avatarRoot: "" },
      folder: { avatarRoot: "bg-transparent" },
    },
  },
  compoundVariants: [
    {
      enhanced: true,
      itemType: "folder",
      class: { avatarRoot: "bg-accented/60" },
    },
  ],
  defaultVariants: {
    enhanced: false,
    dragged: false,
    dropTarget: false,
    itemType: "file",
  },
});

interface Props {
  data: FileItemPublic | FolderItemPublic;
}

const props = defineProps<Props>();
const { gridStyle } = useFinderLayout();
const { isEdited, currentFolder, currentFile } = useFinderContext();
const { isItemSelected } = useFinderSelect();
const hooks = useFinderHooks();
const { handleModifiedClick } = useFinderSelectionClick();

const editedName = ref("");
const target = useTemplateRef<HTMLElement>("item-card-ref");

const { contextMenuItems } = useItemContextMenu(() => props.data);
const itemIcon = computed(() => getItemIcon(props.data));
const itemPreview = computed(() => getItemPreview(props.data));
const folderId = computed(() => getItemFolderId(props.data));
const FILENAME_EXTENSION_PATTERN = /\.[a-z0-9]+$/i;

const itemName = computed(() => {
  const name = props.data.name;
  if (props.data.type !== FileExplorerItemType.File) return name;
  if (FILENAME_EXTENSION_PATTERN.test(name)) return name;
  return `${name}.${getExtensionLabel(props.data.mimetype ?? "")}`;
});

const itemState = computed(() => {
  const isSelected = isItemSelected(props.data);
  const isBeingEdited = isEdited(props.data);
  const isEnhanced = isSelected || isBeingEdited;

  return {
    isSelected,
    isBeingEdited,
    isEnhanced,
  };
});

const ghostRef = useTemplateRef<HTMLElement>("drag-ghost");
const { isDragged, handlers: dragHandlers } = useDraggableItem(
  props.data,
  ghostRef,
);
const { isValidDropTarget } = useDropTarget(folderId.value, target);

const ui = computed(() =>
  theme({
    enhanced: itemState.value.isEnhanced,
    dragged: isDragged.value,
    dropTarget: isValidDropTarget.value,
    itemType: props.data.type === FileExplorerItemType.File ? "file" : "folder",
  }),
);

const avatarUi = computed(() => ({
  root: ui.value.avatarRoot(),
  image: ui.value.avatarImage(),
  icon: ui.value.avatarIcon(),
}));

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

function handleClick(event: MouseEvent) {
  if (handleModifiedClick(event, props.data)) return;

  hooks.callHook("select:item:clear");

  const handler = clickHandlers[props.data.type];
  if (handler) {
    handler(props.data as never);
  }
}

const dblClickHandlers = {
  [FileExplorerItemType.File]: (item: FileItemPublic) =>
    hooks.callHook("file:preview:open", item),
  [FileExplorerItemType.Folder]: (item: FolderItemPublic) =>
    hooks.callHook("folder:open", item),
};

function handleDoubleClick() {
  const handler = dblClickHandlers[props.data.type];

  if (handler) {
    handler(props.data as never);
  }
}

useDeselectOnOutsideClick(
  target,
  () => {
    if (!itemState.value.isSelected) return;
    hooks.callHook("deselect:item", props.data);

    if (
      props.data.type === FileExplorerItemType.File &&
      currentFile.value?.id === props.data.id
    ) {
      hooks.callHook("file:details:inactive");
    }

    if (
      props.data.type === FileExplorerItemType.Folder &&
      currentFolder.value?.id === props.data.id
    ) {
      hooks.callHook("folder:details:inactive");
    }
  },
  {
    deselect: computed(() => itemState.value.isSelected),
  },
);
</script>

<template>
  <div class="select-none" :style="gridStyle.card">
    <FinderLayoutViewCardGhost
      ref="drag-ghost"
      :icon="itemIcon"
      :preview="itemPreview"
    />
    <UContextMenu :items="contextMenuItems" class="aspect-square size-full">
      <div
        class="@container transition-all"
        @dblclick="handleDoubleClick"
        @click="handleClick($event)"
      >
        <div ref="item-card-ref" v-bind="dragHandlers" :class="ui.root()">
          <UAvatar
            :src="itemPreview"
            :alt="data.name"
            :icon="itemIcon"
            :ui="avatarUi"
          />

          <FinderLayoutViewCardInput
            v-if="itemState.isBeingEdited"
            v-model="editedName"
            :item="data"
          />
          <p v-else class="w-full shrink-0 grow text-center text-xs">
            <span
              class="inline-block max-w-full truncate rounded-[5px] px-1.5 py-px align-bottom"
              :class="
                itemState.isSelected
                  ? 'bg-primary text-inverted'
                  : 'text-default'
              "
            >
              {{ itemName }}
            </span>
          </p>
        </div>
      </div>
    </UContextMenu>
  </div>
</template>
