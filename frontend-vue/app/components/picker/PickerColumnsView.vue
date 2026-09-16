<script setup lang="ts">
import type { MockItemPublic } from "../../utils/finder/models";
import {
	isPickerFile,
	PICKER_ROOT_TREE_VALUE,
	usePickerExplorer,
} from "../../composables/picker/usePickerExplorer";

const { t } = useI18n();
const explorer = usePickerExplorer();
const {
	currentPath,
	focusedFile,
	renamingId,
	itemsForFolder,
	isSelected,
	isDisabled,
	handleItemClick,
	handleItemOpen,
	commitRename,
	cancelRename,
	setContextTarget,
	dropTargetId,
	handleDragStart,
	handleDragEnd,
	handleFolderDragOver,
	handleFolderDragLeave,
	handleFolderDrop,
} = explorer;

function itemDragOver(event: DragEvent, item: MockItemPublic): void {
	if (!isPickerFile(item)) handleFolderDragOver(event, item.id);
}

function itemDragLeave(item: MockItemPublic): void {
	if (!isPickerFile(item)) handleFolderDragLeave(item.id);
}

function itemDrop(event: DragEvent, item: MockItemPublic): void {
	if (!isPickerFile(item)) handleFolderDrop(event, item.id);
}

interface PickerColumn {
	id: string | null;
	label: string;
	items: MockItemPublic[];
}

const columns = computed<PickerColumn[]>(() => {
	const rootColumn: PickerColumn = {
		id: null,
		label: t("dms.finder.navigation.root"),
		items: itemsForFolder(null),
	};
	const folderColumns = currentPath.value.map((folder) => ({
		id: folder.id,
		label: folder.name,
		items: itemsForFolder(folder.id),
	}));
	return [rootColumn, ...folderColumns];
});

const activePathIds = computed(
	() => new Set(currentPath.value.map((folder) => folder.id)),
);

const scrollerRef = useTemplateRef<HTMLElement>("scroller");

watch(
	() => [columns.value.length, focusedFile.value?.id],
	async () => {
		await nextTick();
		const element = scrollerRef.value;
		if (element) element.scrollLeft = element.scrollWidth;
	},
);

function rowClass(item: MockItemPublic): string {
	if (isSelected(item)) return "bg-primary/10 text-primary";
	if (!isPickerFile(item) && activePathIds.value.has(item.id)) {
		return "bg-accented text-highlighted";
	}
	return "text-toned hover:bg-elevated";
}
</script>

<template>
	<div ref="scroller" class="flex h-full overflow-x-auto">
		<div
			v-for="column in columns"
			:key="column.id ?? 'root'"
			class="flex w-60 shrink-0 flex-col border-e border-default"
			:class="
				dropTargetId === (column.id ?? PICKER_ROOT_TREE_VALUE)
					? 'bg-primary/5 ring-2 ring-primary ring-inset'
					: ''
			"
			@dragover="handleFolderDragOver($event, column.id)"
			@dragleave="handleFolderDragLeave(column.id)"
			@drop="handleFolderDrop($event, column.id)"
		>
			<div class="px-3.5 pt-3 pb-1.5 text-[13px] font-semibold text-highlighted">
				{{ column.label }}
				<span class="block text-[11px] font-normal text-muted">
					{{
						t("dms.finder.column.elements_count", {
							count: column.items.length,
						})
					}}
				</span>
			</div>
			<div class="flex-1 overflow-y-auto p-1.5">
				<button
					v-for="item in column.items"
					:key="item.id"
					class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors select-none"
					:class="[
						rowClass(item),
						isDisabled(item) ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
						dropTargetId === item.id ? 'ring-2 ring-primary ring-inset' : '',
					]"
					:title="
						isDisabled(item) ? t('dms_media.picker.not_accepted') : undefined
					"
					:draggable="renamingId !== item.id"
					@click="handleItemClick(item, $event)"
					@dblclick="handleItemOpen(item)"
					@contextmenu.capture="setContextTarget(item)"
					@dragstart="handleDragStart($event, item)"
					@dragend="handleDragEnd()"
					@dragover="itemDragOver($event, item)"
					@dragleave="itemDragLeave(item)"
					@drop="itemDrop($event, item)"
				>
					<span
						class="relative size-6 shrink-0 overflow-hidden rounded ring-1 ring-default/60"
					>
						<DmsMediaPickerItemThumb :item="item" compact />
					</span>
					<span class="min-w-0 flex-1 truncate">
						<DmsMediaPickerNameEdit
							v-if="renamingId === item.id"
							:name="item.name"
							@commit="(name) => commitRename(item, name)"
							@cancel="cancelRename"
						/>
						<template v-else>{{ item.name }}</template>
					</span>
					<UIcon
						v-if="!isPickerFile(item)"
						name="i-lucide-chevron-right"
						class="size-3.5 shrink-0 text-dimmed"
					/>
				</button>
				<div
					v-if="!column.items.length"
					class="px-3 py-6 text-center text-xs text-dimmed"
				>
					{{ t("dms_media.picker.empty_folder_title") }}
				</div>
			</div>
		</div>
		<div
			v-if="focusedFile"
			class="w-64 shrink-0 overflow-y-auto p-4"
		>
			<DmsMediaPickerPreviewBody :file="focusedFile" />
		</div>
	</div>
</template>
