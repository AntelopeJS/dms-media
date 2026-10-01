<script setup lang="ts">
import type { TreeItem } from "@nuxt/ui";
import {
	PICKER_ROOT_TREE_VALUE,
	usePickerExplorer,
} from "../../composables/picker/usePickerExplorer";

const { t } = useI18n();
const explorer = usePickerExplorer();
const {
	treeItems,
	location,
	isSearching,
	currentPath,
	openFolder,
	showRecents,
} = explorer;

const expandedKeys = ref<string[]>([PICKER_ROOT_TREE_VALUE]);

const isRecentsActive = computed(
	() => location.value.kind === "recents" && !isSearching.value,
);

function findTreeItem(
	items: TreeItem[],
	value: string,
): TreeItem | undefined {
	for (const item of items) {
		if (item.value === value) return item;
		const child = findTreeItem(item.children ?? [], value);
		if (child) return child;
	}
	return undefined;
}

const selectedTreeItem = computed(() => {
	if (location.value.kind !== "folder" || isSearching.value) return undefined;
	const value = location.value.folderId ?? PICKER_ROOT_TREE_VALUE;
	return findTreeItem(treeItems.value, value);
});

function handleTreeSelect(item: TreeItem | TreeItem[] | undefined): void {
	if (!item || Array.isArray(item)) return;
	const folderId =
		item.value === PICKER_ROOT_TREE_VALUE ? null : String(item.value);
	openFolder(folderId);
}

watch(currentPath, (path) => {
	const pathIds = path.map((folder) => folder.id);
	expandedKeys.value = [
		...new Set([...expandedKeys.value, PICKER_ROOT_TREE_VALUE, ...pathIds]),
	];
});
</script>

<template>
	<aside
		class="hidden w-56 shrink-0 overflow-y-auto border-e border-default bg-elevated/40 p-2 md:block"
	>
		<UButton
			:variant="isRecentsActive ? 'soft' : 'ghost'"
			:color="isRecentsActive ? 'primary' : 'neutral'"
			icon="i-lucide-clock"
			size="sm"
			block
			class="justify-start"
			:label="t('dms_media.picker.recents')"
			@click="showRecents()"
		/>
		<div
			class="px-2.5 pt-4 pb-1 text-[10px] font-semibold tracking-wider text-dimmed uppercase"
		>
			{{ t("dms_media.picker.locations") }}
		</div>
		<UTree
			v-model:expanded="expandedKeys"
			:items="treeItems"
			:get-key="(item: TreeItem) => String(item.value)"
			:model-value="selectedTreeItem"
			color="primary"
			size="sm"
			@update:model-value="handleTreeSelect"
		/>
	</aside>
</template>
