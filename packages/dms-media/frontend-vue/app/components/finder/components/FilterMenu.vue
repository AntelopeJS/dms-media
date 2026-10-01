<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

type FilterType = "all" | "images" | "documents" | "other";
type SortBy = "name" | "date" | "size" | "type";

const FILTER_TYPES: FilterType[] = ["all", "images", "documents", "other"];
const SORT_OPTIONS: SortBy[] = ["name", "date", "size", "type"];

const FILTER_LABELS: Record<FilterType, string> = {
  all: "dms.finder.filter.all",
  images: "dms.finder.filter.images",
  documents: "dms.finder.filter.documents",
  other: "dms.finder.filter.other",
};

const FILTER_ICONS: Record<FilterType, string> = {
  all: "i-heroicons-document-duplicate",
  images: "i-heroicons-photo",
  documents: "i-heroicons-document-text",
  other: "i-heroicons-folder",
};

const SORT_LABELS: Record<SortBy, string> = {
  name: "dms.finder.sort.name",
  date: "dms.finder.sort.date",
  size: "dms.finder.sort.size",
  type: "dms.finder.sort.type",
};

const SORT_ICONS: Record<SortBy, string> = {
  name: "i-heroicons-bars-arrow-down",
  date: "i-heroicons-calendar",
  size: "i-heroicons-scale",
  type: "i-heroicons-document",
};

const filterType = defineModel<FilterType[]>("filterType", {
  default: () => ["all"],
});

const sortBy = defineModel<SortBy>("sortBy", {
  default: "name",
});

const { t } = useI18n();

const isFilterChecked = (type: FilterType) => {
  const current = filterType.value;
  if (type === "all") {
    return current.length === 0 || current.includes("all");
  }
  return current.includes(type);
};

const filterItems = computed<DropdownMenuItem[]>(() => [
  [{ label: t("dms.finder.filter.title"), type: "label" }],
  [
    ...FILTER_TYPES.map((type) => ({
      label: t(FILTER_LABELS[type]),
      icon: FILTER_ICONS[type],
      type: "checkbox",
      checked: isFilterChecked(type),
      onUpdateChecked: () => handleFilterType(type),
      onSelect: (e: Event) => e.preventDefault(),
    })),
  ],
  [{ label: t("dms.finder.filter.sort_by"), type: "label" }],
  [
    ...SORT_OPTIONS.map((option) => ({
      label: t(SORT_LABELS[option]),
      icon: SORT_ICONS[option],
      type: "checkbox",
      checked: sortBy.value === option,
      onUpdateChecked: () => handleSortBy(option),
      onSelect: (e: Event) => e.preventDefault(),
    })),
  ],
]);

function handleFilterType(value: FilterType) {
  const current = [...filterType.value];
  if (value === "all") {
    filterType.value = ["all"];
    return;
  }
  const idx = current.indexOf(value);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    const withoutAll = current.filter((item) => item !== "all");
    withoutAll.push(value);
    current.length = 0;
    current.push(...withoutAll);
  }
  filterType.value = current.length === 0 ? ["all"] : current;
}

function handleSortBy(value: SortBy) {
  sortBy.value = value;
}
</script>

<template>
  <UDropdownMenu :items="filterItems">
    <UButton
      icon="i-heroicons-adjustments-horizontal"
      variant="outline"
      color="neutral"
      size="sm"
    >
      <span class="hidden sm:inline">{{ $t("dms.finder.filter.button") }}</span>
    </UButton>
  </UDropdownMenu>
</template>
