<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

interface Props {
  maxVisibleItems?: number;
}

const props = withDefaults(defineProps<Props>(), {
  maxVisibleItems: 3,
});

const { t } = useI18n();
const { map } = useFinderStore();
const { openedFolder } = useFinderContext();
const hooks = useFinderHooks();

const breadcrumbs = computed<BreadcrumbItemWithClick[]>(() => {
  const folders = openedFolder.value?.path ?? [];
  const root: BreadcrumbItemWithClick = {
    label: t("dms.finder.navigation.root"),
    icon: "i-lucide-home",
    click: () => {
      hooks.callHook("folder:open", null);
    },
  };

  return folders
    .map((id, index, arr): BreadcrumbItemWithClick | undefined => {
      const folder = map.value.folders.get(id);
      if (!folder) return;

      return {
        label: folder.name,
        icon: folder.icon,
        click:
          index < arr.length - 1
            ? () => {
                hooks.callHook("folder:open", folder);
              }
            : undefined,
      };
    })
    .filter((f): f is BreadcrumbItemWithClick => f !== undefined)
    .toSpliced(0, 0, root);
});

const hiddenItems = computed<DropdownMenuItem[]>(() => {
  const items = breadcrumbs.value;
  const offset = 1;
  const limit = props.maxVisibleItems - 1;

  const isShortened = items.length <= props.maxVisibleItems;

  return isShortened
    ? []
    : items.slice(offset, -limit).map((item) => ({
        label: item.label,
        icon: item.icon,
        onSelect: item.click,
      }));
});

const itemsBreadcrumb = computed<BreadcrumbItemWithClick[]>(() => {
  const items = breadcrumbs.value;
  const first = items.at(0);
  const last = items.at(-1);

  const isShortened = items.length <= props.maxVisibleItems || !first || !last;

  return isShortened
    ? items
    : [
        first,
        {
          slot: "dropdown" as const,
          icon: "i-heroicons-ellipsis-horizontal",
        },
        last,
      ];
});
</script>

<template>
  <UBreadcrumb :items="itemsBreadcrumb" class="select-none">
    <template #item="{ item, active }">
      <button
        v-if="item.click && !active"
        class="text-muted hover:text-foreground breadcrumbs-center flex gap-1.5 text-sm transition-colors"
        @click="item.click"
      >
        <UIcon v-if="item.icon" :name="item.icon" class="size-4" />
        <span>{{ item.label }}</span>
      </button>
      <span
        v-else-if="!item.slot"
        class="text-foreground breadcrumbs-center flex gap-1.5 text-sm font-medium"
      >
        <UIcon v-if="item.icon" :name="item.icon" class="size-4" />
        <span>{{ item.label }}</span>
      </span>
    </template>

    <template #dropdown>
      <UDropdownMenu :items="hiddenItems">
        <UButton
          icon="i-heroicons-ellipsis-horizontal"
          color="neutral"
          variant="link"
          class="p-0.5"
        />
      </UDropdownMenu>
    </template>
  </UBreadcrumb>
</template>
