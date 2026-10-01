<script setup lang="ts">
import type { BreadcrumbItem, DropdownMenuItem, TabsItem } from "@nuxt/ui";
import { FILTERABLE_FILE_GROUPS } from "../../utils/finder/filegroup";
import {
	usePickerExplorer,
	type PickerViewMode,
} from "../../composables/picker/usePickerExplorer";

const { t } = useI18n();
const explorer = usePickerExplorer();
const {
	canGoBack,
	canGoForward,
	goBack,
	goForward,
	location,
	currentPath,
	isSearching,
	groupFilter,
	viewMode,
	effectiveViewMode,
	isColumnsAvailable,
	isPreviewOpen,
	openFolder,
} = explorer;

const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
	if (isSearching.value) {
		return [{ label: t("dms_media.picker.search_results"), icon: "i-lucide-search" }];
	}
	if (location.value.kind === "recents") {
		return [{ label: t("dms_media.picker.recents"), icon: "i-lucide-clock" }];
	}
	const rootItem: BreadcrumbItem = {
		label: t("dms.finder.navigation.root"),
		icon: "i-lucide-home",
		class: "cursor-pointer",
		onClick: () => openFolder(null),
	};
	const folderItems = currentPath.value.map((folder, index) => {
		const isLast = index === currentPath.value.length - 1;
		return {
			label: folder.name,
			class: isLast ? undefined : "cursor-pointer",
			onClick: isLast ? undefined : () => openFolder(folder.id),
		};
	});
	return [rootItem, ...folderItems];
});

const activeFilterLabel = computed(() => {
	const active = FILTERABLE_FILE_GROUPS.find(
		(group) => group.id === groupFilter.value,
	);
	return active ? t(active.labelKey) : t("dms.finder.filter.button");
});

const filterMenuItems = computed<DropdownMenuItem[]>(() => [
	{
		label: t("dms_media.picker.filter_all"),
		icon: groupFilter.value === null ? "i-lucide-check" : undefined,
		onSelect: () => (groupFilter.value = null),
	},
	...FILTERABLE_FILE_GROUPS.map((group) => ({
		label: t(group.labelKey),
		icon: groupFilter.value === group.id ? "i-lucide-check" : undefined,
		onSelect: () => (groupFilter.value = group.id),
	})),
]);

const viewTabs = computed<TabsItem[]>(() => [
	{ value: "grid", icon: "i-lucide-layout-grid" },
	{ value: "list", icon: "i-lucide-list" },
	{
		value: "columns",
		icon: "i-lucide-columns-3",
		disabled: !isColumnsAvailable.value,
	},
]);

function handleViewChange(value: string | number): void {
	viewMode.value = String(value) as PickerViewMode;
}
</script>

<template>
	<div class="flex items-center gap-2 border-b border-default px-4 py-2">
		<UButton
			icon="i-lucide-arrow-left"
			variant="ghost"
			color="neutral"
			size="sm"
			square
			:disabled="!canGoBack"
			:aria-label="t('dms.finder.navigation.previous')"
			@click="goBack()"
		/>
		<UButton
			icon="i-lucide-arrow-right"
			variant="ghost"
			color="neutral"
			size="sm"
			square
			:disabled="!canGoForward"
			:aria-label="t('dms.finder.navigation.next')"
			@click="goForward()"
		/>
		<UBreadcrumb
			:items="breadcrumbItems"
			class="min-w-0 flex-1 overflow-hidden"
		/>
		<UDropdownMenu :items="filterMenuItems" :content="{ align: 'end' }">
			<UButton
				:label="activeFilterLabel"
				icon="i-lucide-list-filter"
				size="sm"
				:variant="groupFilter ? 'soft' : 'outline'"
				:color="groupFilter ? 'primary' : 'neutral'"
			/>
		</UDropdownMenu>
		<UTabs
			:items="viewTabs"
			:content="false"
			:model-value="effectiveViewMode"
			color="neutral"
			size="xs"
			class="shrink-0"
			@update:model-value="handleViewChange"
		/>
		<UButton
			icon="i-lucide-panel-right"
			size="sm"
			square
			:variant="isPreviewOpen ? 'soft' : 'outline'"
			:color="isPreviewOpen ? 'primary' : 'neutral'"
			:disabled="effectiveViewMode === 'columns'"
			:aria-label="t('dms_media.picker.preview_panel')"
			class="hidden sm:inline-flex"
			@click="isPreviewOpen = !isPreviewOpen"
		/>
	</div>
</template>
