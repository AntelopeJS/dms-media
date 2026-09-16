<script setup lang="ts">
import type { TreeItem } from "@nuxt/ui";
import type {
  FolderItem,
  FolderItemPublic,
  FileItemPublic,
} from "../../../../utils/finder/models";
import { FileExplorerItemType } from "../../../../utils/finder/models";
import type { Props as PanelProps } from "../../core/panel.vue";

interface RecentFileTreeItem extends TreeItem {
  file: FileItemPublic;
}

interface FavoriteFolderTreeItem extends TreeItem {
  folder: FolderItemPublic;
}

const _props = withDefaults(defineProps<Partial<PanelProps>>(), {
  minWidth: 200,
  preferedWidth: 250,
  maxWidth: 400,
});

const { t } = useI18n();
const {
  favoriteFolderIds,
  draggedFavoriteId,
  toggleFavorite,
  removeFavorite,
  startFavoriteDrag,
  endFavoriteDrag,
} = useFavoritesFolder();
const { recentFiles } = await useRecentFile();
const { map } = useFinderStore();
const hooks = useFinderHooks();
const { draggingItems } = useFinderDragAndDrop();

const shortcutsPanelRef = useTemplateRef<HTMLElement>("shortcuts-panel");
const isDropTarget = ref(false);
const contextMenuTargetId = ref<string | null>(null);

const draggingFolders = computed(() =>
  draggingItems.value.filter(
    (item) => item.type === FileExplorerItemType.Folder,
  ),
);

const isValidFolderDrop = computed(() => draggingFolders.value.length > 0);

const shouldHighlight = computed(
  () => isDropTarget.value && isValidFolderDrop.value,
);

const sortedFavorites = computed((): FavoriteFolderTreeItem[] =>
  favoriteFolderIds.value
    .map((id) => map.value.entries.get(id))
    .filter(
      (item): item is FolderItem =>
        item != null && item.type === FileExplorerItemType.Folder,
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (folder): FavoriteFolderTreeItem => ({
        label: folder.name,
        icon: folder.icon ?? "i-heroicons-folder",
        value: folder.id,
        slot: "favorite-folder" as const,
        folder: folder,
      }),
    ),
);

const treeItems = computed((): TreeItem[] => [
  {
    label: t("dms.finder.panel.recents"),
    icon: "i-heroicons-clock",
    children: recentFiles.value.map((file) => ({
      label: file.name,
      icon: file.icon ?? "i-heroicons-document",
      value: file.id,
      slot: "recent-file" as const,
      file: file,
    })),
  },
  {
    label: t("dms.finder.panel.favorites"),
    icon: "i-heroicons-star",
    defaultExpanded: true,
    children: sortedFavorites.value,
  },
]);

const favoriteContextMenu = computed(() => [
  [
    {
      label: t("dms.finder.actions.remove_from_favorites"),
      icon: "i-heroicons-star-solid",
      onSelect: () => {
        if (!contextMenuTargetId.value) return;
        removeFavorite(contextMenuTargetId.value);
      },
    },
  ],
]);

function handleDragOver(event: DragEvent) {
  if (!isValidFolderDrop.value) return;
  event.preventDefault();
  isDropTarget.value = true;
}

function handleDragLeave() {
  isDropTarget.value = false;
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  draggingFolders.value.forEach((folder) => {
    toggleFavorite(folder.id);
  });
  isDropTarget.value = false;
}

function handleContextMenu(folderId: string) {
  contextMenuTargetId.value = folderId;
}

function openFolder(folder: FolderItemPublic) {
  hooks.callHook("folder:open", folder);
}

function selectFile(file: FileItemPublic) {
  const folder = map.value.folders.get(file.ancestor ?? "");
  if (folder) {
    hooks.callHook("folder:open", folder);
  }
  hooks.callHook("file:details:active", file);
  hooks.callHook("finder:details:active");
}

watch(
  shortcutsPanelRef,
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
</script>

<template>
  <FinderCorePanel
    data-finder-panel-sidebar
    :prefered-width="preferedWidth"
    :min-width="minWidth"
    :max-width="maxWidth"
    side="left"
    collapsible
    class="sticky top-0 left-0 z-10 hidden sm:block"
  >
    <div
      ref="shortcuts-panel"
      :class="[
        'flex h-full shrink-0 flex-col justify-start overflow-y-auto px-2 py-6 transition-colors select-none',
        shouldHighlight && 'bg-primary-500/10',
      ]"
    >
      <ClientOnly>
        <UTree :items="treeItems" size="xs" class="w-full">
          <template #recent-file="{ item }: { item: RecentFileTreeItem }">
            <button
              type="button"
              class="flex w-full items-center gap-2 truncate"
              @click="selectFile(item.file)"
            >
              <UIcon
                :name="item.icon ?? 'i-heroicons-document'"
                class="size-4 shrink-0"
              />
              <span class="truncate">{{ item.label }}</span>
            </button>
          </template>

          <template
            #favorite-folder="{ item }: { item: FavoriteFolderTreeItem }"
          >
            <UContextMenu
              :items="favoriteContextMenu"
              @update:open="
                (isOpen) => isOpen && handleContextMenu(item.value as string)
              "
            >
              <button
                type="button"
                draggable="true"
                :class="[
                  'flex w-full items-center gap-2 truncate',
                  draggedFavoriteId === item.value && 'opacity-50',
                ]"
                @click="openFolder(item.folder)"
                @dragstart="startFavoriteDrag(item.folder.id, $event)"
                @dragend="
                  endFavoriteDrag(
                    $event,
                    shortcutsPanelRef?.getBoundingClientRect(),
                  )
                "
              >
                <UIcon
                  :name="item.icon ?? 'i-heroicons-folder'"
                  class="size-4 shrink-0"
                />
                <span class="truncate">{{ item.label }}</span>
              </button>
            </UContextMenu>
          </template>
        </UTree>
        <template #fallback>
          <div class="w-full space-y-4">
            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <USkeleton class="size-4 shrink-0" />
                <USkeleton class="h-4 w-24" />
              </div>
              <div class="ml-6 space-y-3">
                <div
                  v-for="i in 3"
                  :key="`recent-${i}`"
                  class="flex items-center gap-2"
                >
                  <USkeleton class="size-4 shrink-0" />
                  <USkeleton class="h-4" :style="{ width: `${60 + i * 15}px` }" />
                </div>
              </div>
            </div>
            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <USkeleton class="size-4 shrink-0" />
                <USkeleton class="h-4 w-28" />
              </div>
              <div class="ml-6 space-y-3">
                <div
                  v-for="j in 2"
                  :key="`favorite-${j}`"
                  class="flex items-center gap-2"
                >
                  <USkeleton class="size-4 shrink-0" />
                  <USkeleton class="h-4" :style="{ width: `${70 + j * 12}px` }" />
                </div>
              </div>
            </div>
          </div>
        </template>
      </ClientOnly>
    </div>
  </FinderCorePanel>
</template>
