<script setup lang="ts">
import type { MockItemPublic } from "../../utils/finder/models";
import { formatFileSize } from "../../utils/finder/filesize";
import { formatRelativeDate } from "../../utils/finder/formatter";
import { resolveFileGroup } from "../../utils/finder/filegroup";
import {
	isPickerFile,
	usePickerExplorer,
	type PickerSortKey,
} from "../../composables/picker/usePickerExplorer";

const { t } = useI18n();
const explorer = usePickerExplorer();
const {
	visibleItems,
	sort,
	renamingId,
	isSearching,
	isSelected,
	isDisabled,
	toggleSelection,
	toggleSort,
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

interface ListColumn {
	key: PickerSortKey;
	labelKey: string;
}

const LIST_COLUMNS: ListColumn[] = [
	{ key: "name", labelKey: "dms.finder.table.name" },
	{ key: "type", labelKey: "dms.finder.table.type" },
	{ key: "size", labelKey: "dms.finder.table.size" },
	{ key: "date", labelKey: "dms.finder.table.modified" },
];

const GRID_TEMPLATE =
	"grid-cols-[36px_minmax(0,1fr)_96px_110px_120px_36px]";

function typeLabel(item: MockItemPublic): string {
	if (!isPickerFile(item)) return t("dms.finder.details.folder_type");
	return t(resolveFileGroup(item.mimetype).labelKey);
}

function sizeLabel(item: MockItemPublic): string {
	if (isPickerFile(item)) return formatFileSize(item.size);
	return t("dms.finder.column.elements_count", {
		count: item.childrenIds.length,
	});
}

function modifiedLabel(item: MockItemPublic): string {
	if (!isPickerFile(item)) return "—";
	return formatRelativeDate(item.updatedAt, t);
}
</script>

<template>
	<div class="overflow-hidden rounded-xl border border-default bg-default">
		<div
			class="grid h-10 items-center gap-2 border-b border-default bg-elevated/60 px-2.5"
			:class="GRID_TEMPLATE"
		>
			<span></span>
			<button
				v-for="column in LIST_COLUMNS"
				:key="column.key"
				class="flex cursor-pointer items-center gap-1 text-left text-[11px] font-semibold tracking-wider text-muted uppercase hover:text-highlighted"
				@click="toggleSort(column.key)"
			>
				{{ t(column.labelKey) }}
				<UIcon
					v-if="sort.key === column.key"
					name="i-lucide-chevron-down"
					class="size-3 transition-transform"
					:class="sort.direction === 'desc' ? 'rotate-180' : ''"
				/>
			</button>
			<span></span>
		</div>
		<div
			v-for="item in visibleItems"
			:key="item.id"
			class="grid h-12 items-center gap-2 border-b border-default px-2.5 transition-colors select-none last:border-b-0"
			:class="[
				GRID_TEMPLATE,
				isSelected(item) ? 'bg-primary/10' : 'hover:bg-elevated/60',
				isDisabled(item) ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
				dropTargetId === item.id ? 'ring-2 ring-primary ring-inset' : '',
			]"
			:title="isDisabled(item) ? t('dms_media.picker.not_accepted') : undefined"
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
			<span class="grid place-items-center" @click.stop @dblclick.stop>
				<UCheckbox
					v-if="isPickerFile(item) && !isDisabled(item)"
					:model-value="isSelected(item)"
					color="primary"
					@update:model-value="toggleSelection(item)"
				/>
			</span>
			<div class="flex min-w-0 items-center gap-2.5">
				<span
					class="relative size-8 shrink-0 overflow-hidden rounded-md ring-1 ring-default/60"
				>
					<DmsMediaPickerItemThumb :item="item" compact />
				</span>
				<span class="min-w-0 flex-1">
					<DmsMediaPickerNameEdit
						v-if="renamingId === item.id"
						:name="item.name"
						@commit="(name) => commitRename(item, name)"
						@cancel="cancelRename"
					/>
					<span
						v-else
						class="block truncate text-[13px] font-medium text-highlighted"
					>
						{{ item.name }}
					</span>
					<span
						v-if="isSearching"
						class="block truncate text-[11px] text-muted"
					>
						{{ pathLabel(item) }}
					</span>
				</span>
				<UIcon
					v-if="!isPickerFile(item)"
					name="i-lucide-chevron-right"
					class="size-3.5 shrink-0 text-dimmed"
				/>
			</div>
			<span class="truncate text-xs text-toned">{{ typeLabel(item) }}</span>
			<span class="truncate text-xs text-toned">{{ sizeLabel(item) }}</span>
			<span class="truncate text-xs text-toned">{{ modifiedLabel(item) }}</span>
			<span class="grid place-items-center" @click.stop @dblclick.stop>
				<UDropdownMenu
					v-if="!isDisabled(item)"
					:items="buildItemMenu(item)"
					:content="{ align: 'end' }"
				>
					<UButton
						icon="i-lucide-ellipsis"
						size="xs"
						variant="ghost"
						color="neutral"
						square
						class="opacity-60 hover:opacity-100"
					/>
				</UDropdownMenu>
			</span>
		</div>
	</div>
</template>
