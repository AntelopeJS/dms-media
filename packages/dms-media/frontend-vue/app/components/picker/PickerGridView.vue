<script setup lang="ts">
import type { MockItemPublic } from "../../utils/finder/models";
import { formatFileSize } from "../../utils/finder/filesize";
import {
	isPickerFile,
	usePickerExplorer,
} from "../../composables/picker/usePickerExplorer";

const { t } = useI18n();
const explorer = usePickerExplorer();
const {
	visibleItems,
	tileSize,
	renamingId,
	isSearching,
	isSelected,
	isDisabled,
	toggleSelection,
	handleItemClick,
	handleItemOpen,
	commitRename,
	cancelRename,
	setContextTarget,
	buildItemMenu,
	pathLabel,
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

function itemMeta(item: MockItemPublic): string {
	if (isPickerFile(item)) return formatFileSize(item.size);
	return t("dms.finder.column.elements_count", {
		count: item.childrenIds.length,
	});
}

function itemTitle(item: MockItemPublic): string | undefined {
	if (isDisabled(item)) return t("dms_media.picker.not_accepted");
	if (isSearching.value) return pathLabel(item);
	return undefined;
}
</script>

<template>
	<div
		class="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(var(--tile),1fr))]"
		:style="{ '--tile': tileSize }"
	>
		<div
			v-for="item in visibleItems"
			:key="item.id"
			class="group relative rounded-xl p-2 transition-colors select-none"
			:class="[
				isSelected(item) ? 'bg-primary/10' : 'hover:bg-elevated',
				isDisabled(item) ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
				dropTargetId === item.id ? 'ring-2 ring-primary' : '',
			]"
			:title="itemTitle(item)"
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
			<div class="relative mb-2 aspect-square overflow-hidden rounded-lg">
				<DmsMediaPickerItemThumb :item="item" />
				<span
					v-if="isPickerFile(item) && !isDisabled(item)"
					class="absolute top-1.5 left-1.5 z-10 transition-opacity"
					:class="
						isSelected(item) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
					"
					@click.stop
					@dblclick.stop
				>
					<UCheckbox
						:model-value="isSelected(item)"
						color="primary"
						@update:model-value="toggleSelection(item)"
					/>
				</span>
				<UDropdownMenu
					v-if="!isDisabled(item)"
					:items="buildItemMenu(item)"
					:content="{ align: 'start' }"
				>
					<UButton
						icon="i-lucide-ellipsis"
						size="xs"
						variant="solid"
						color="neutral"
						square
						class="absolute right-1.5 bottom-1.5 z-10 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
						@click.stop
						@dblclick.stop
					/>
				</UDropdownMenu>
			</div>
			<DmsMediaPickerNameEdit
				v-if="renamingId === item.id"
				:name="item.name"
				@commit="(name) => commitRename(item, name)"
				@cancel="cancelRename"
			/>
			<div
				v-else
				class="truncate text-center text-xs font-medium text-highlighted"
			>
				{{ item.name }}
			</div>
			<div class="mt-0.5 truncate text-center text-[11px] text-muted">
				{{ itemMeta(item) }}
			</div>
		</div>
	</div>
</template>
