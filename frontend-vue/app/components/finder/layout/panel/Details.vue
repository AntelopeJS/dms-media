<script setup lang="ts">
import type { ButtonProps } from "@nuxt/ui";
import { breakpointsTailwind, useBreakpoints } from "@vueuse/core";
import { FileExplorerItemType } from "../../../../utils/finder/models";
import type { Props as PanelProps } from "../../core/panel.vue";

withDefaults(defineProps<Partial<PanelProps>>(), {
  minWidth: 250,
  preferedWidth: 300,
  maxWidth: 500,
});

const { t } = useI18n();
const { handleDeleteItem, handleShare: handleShareItem } = useFinderStore();
const { currentFile, currentFolder } = useFinderContext();
const { showDetails } = useFinderLayout();
const { formatFileSize, folderSize } = useFinderSize();
const hooks = useFinderHooks();

const breakpoints = useBreakpoints(breakpointsTailwind, { ssrWidth: 640 });

const isSmAndLarger = breakpoints.greaterOrEqual("sm");

const displayedItem = computed<FileItemPublic | FolderItemPublic | null>(() =>
  showDetails.value && currentFile.value
    ? currentFile.value
    : currentFolder.value,
);

const isFile = computed(
  () => displayedItem.value?.type === FileExplorerItemType.File,
);

const itemIcon = computed(() => getItemIcon(displayedItem.value));

const itemPreview = computed(() => getItemPreview(displayedItem.value));

const details = computed(() => {
  if (!displayedItem.value) return [];

  if (isFile.value) {
    const file = displayedItem.value as FileItemPublic;
    return [
      {
        label: t("dms.finder.details.type"),
        value: getExtensionLabel(file.mimetype ?? ""),
      },
      {
        label: t("dms.finder.details.size"),
        value: formatFileSize(file.size),
      },
      {
        label: t("dms.finder.details.modified"),
        value: formatRelativeDate(file.updatedAt, t),
      },
    ];
  }

  const folder = displayedItem.value as FolderItemPublic;
  return [
    {
      label: t("dms.finder.details.type"),
      value: t("dms.finder.details.folder_type"),
    },
    {
      label: t("dms.finder.details.size"),
      value: folderSize.value,
    },
    {
      label: t("dms.finder.details.modified"),
      value: formatRelativeDate(folder.updatedAt, t),
    },
    {
      label: t("dms.finder.details.elements"),
      value: folder.childrenIds.length.toString(),
    },
  ];
});

const actions = computed((): (ButtonProps & { name: string })[] => [
  {
    name: t("dms.finder.actions.download"),
    icon: "i-lucide-download",
    color: "neutral",
    variant: "ghost",
    square: true,
    size: "sm",
    onClick: handleDownload,
  },
  {
    name: t("dms.finder.actions.share"),
    icon: "i-lucide-share-2",
    color: "neutral",
    variant: "ghost",
    square: true,
    size: "sm",
    onClick: handleShare,
  },
  {
    name: t("dms.finder.actions.delete"),
    icon: "i-lucide-trash-2",
    color: "error",
    variant: "ghost",
    square: true,
    size: "sm",
    onClick: handleDelete,
  },
]);

function handleDownload() {
  console.log(
    "[FINDER] DETAILS PANEL - handleDownload : missing implementation",
  );
}

async function handleDelete() {
  if (!displayedItem.value || !isFile.value) return;
  await handleDeleteItem(displayedItem.value as FileItemPublic);
  hooks.callHook("file:details:active", null);
}

async function handleShare() {
  if (!displayedItem.value || !isFile.value) return;
  await handleShareItem(displayedItem.value as FileItemPublic);
}
</script>

<template>
  <FinderCorePanel
    v-if="showDetails && displayedItem"
    ref="details-panel-ref"
    data-finder-panel-details
    :prefered-width="isSmAndLarger ? preferedWidth : null"
    :min-width="minWidth"
    :max-width="maxWidth"
    :resizeable="isSmAndLarger"
    side="right"
    :class="[
      'shrink-0 bg-transparent opacity-40',
      isSmAndLarger ? 'sticky top-0 right-0 z-10' : 'w-full border-none',
    ]"
  >
    <div
      class="*:border-default flex size-full flex-1 flex-col space-y-4 overflow-y-auto p-4 [&>*:not(:first-child)]:border-t"
    >
      <div>
        <div
          class="flex grow flex-col items-center justify-center gap-2 overflow-hidden py-6"
        >
          <UAvatar
            :src="itemPreview"
            :alt="displayedItem.name"
            :icon="itemIcon"
            :ui="{
              root: 'size-full rounded-md',
              image: 'size-full object-cover',
              icon: 'min-h-40 size-12',
            }"
          />
        </div>
        <h3 class="text-default text-center text-lg font-medium">
          {{ displayedItem.name }}
        </h3>
      </div>

      <div class="grow">
        <table class="w-full pt-4">
          <tbody>
            <tr v-for="detail in details" :key="detail.label">
              <th class="text-dimmed py-1.5 text-left text-xs font-normal">
                {{ detail.label }}
              </th>
              <td class="text-toned py-1.5 text-right text-sm font-medium">
                {{ detail.value }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="isFile" class="flex justify-center gap-2 pt-4 align-middle">
        <UTooltip
          v-for="button in actions"
          :key="button.name"
          :text="button.name"
        >
          <UButton v-bind="button" />
        </UTooltip>
      </div>
    </div>
  </FinderCorePanel>
</template>
