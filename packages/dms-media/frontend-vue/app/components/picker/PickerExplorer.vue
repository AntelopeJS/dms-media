<script setup lang="ts">
import type { FileItemPublic } from "../../utils/finder/models";
import { formatFileSize } from "../../utils/finder/filesize";
import EditImage from "../finder/components/EditImage.vue";
import {
	PICKER_DISMISS_GRACE_MS,
	PICKER_INTERNAL_DRAG_TYPE,
	PICKER_ZOOM_MAX,
	PICKER_ZOOM_MIN,
	useProvidePickerExplorer,
} from "../../composables/picker/usePickerExplorer";

interface Props {
	browse?: boolean;
	multiple?: boolean;
	mimetypes?: string[];
	initialSelectedIds?: string[];
	initialBinding?: string;
	title?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	confirm: [files: FileItemPublic[]];
	cancel: [];
}>();

const { t } = useI18n();

const explorer = useProvidePickerExplorer({
	browse: Boolean(props.browse),
	multiple: Boolean(props.multiple) || Boolean(props.browse),
	mimetypes: props.mimetypes ?? [],
	initialSelectedIds: props.initialSelectedIds ?? [],
	initialBinding: props.initialBinding,
	onConfirm: (files) => emit("confirm", files),
	onCancel: () => emit("cancel"),
});

const {
	isLoading,
	searchQuery,
	isSearching,
	groupFilter,
	effectiveViewMode,
	zoom,
	renamingId,
	isPreviewOpen,
	location,
	isFolderLocation,
	currentFolder,
	visibleItems,
	locationSummary,
	selectedFiles,
	selectionSize,
	restricted,
	multiple: isMultiple,
	browse: isBrowseMode,
	contextMenuItems,
	confirmSelection,
	cancel,
	initialize,
	createFolder,
	uploadFiles,
	setContextTarget,
	lightboxFile,
	closeLightbox,
	movingItem,
	closeMove,
	editingFile,
	finishEdit,
	deletingFile,
	resolveDeleteConfirm,
} = explorer;

const editorOpenedAt = ref(0);

watch(editingFile, (file) => {
	if (file) editorOpenedAt.value = Date.now();
});

function handleEditorOpenChange(open: boolean): void {
	if (open) return;
	if (Date.now() - editorOpenedAt.value < PICKER_DISMISS_GRACE_MS) return;
	if (!editingFile.value) return;
	finishEdit(true);
}

const fileInputRef = useTemplateRef<HTMLInputElement>("fileInput");
const dragDepth = ref(0);

const isEmpty = computed(() => visibleItems.value.length === 0);

const emptyTitle = computed(() => {
	if (isSearching.value) {
		return t("dms_media.picker.empty_search_title", {
			query: searchQuery.value.trim(),
		});
	}
	if (groupFilter.value) return t("dms_media.picker.empty_filtered_title");
	if (location.value.kind === "recents") {
		return t("dms_media.picker.empty_recents_title");
	}
	return t("dms_media.picker.empty_folder_title");
});

const canImportInEmpty = computed(
	() => isFolderLocation.value && !isSearching.value && !groupFilter.value,
);

const emptyHint = computed(() =>
	canImportInEmpty.value
		? t("dms_media.picker.empty_folder_hint")
		: t("dms_media.picker.empty_adjust_hint"),
);

const dropLabel = computed(() =>
	currentFolder.value
		? t("dms_media.picker.drop_in", { name: currentFolder.value.name })
		: t("dms_media.picker.drop_root"),
);

const selectionLabel = computed(() =>
	selectedFiles.value.length
		? t("dms_media.picker.selection_count", {
				count: selectedFiles.value.length,
				size: formatFileSize(selectionSize.value),
			})
		: t("dms_media.picker.selection_empty"),
);

const confirmLabel = computed(() => {
	if (!isMultiple) return t("dms_media.picker.choose");
	if (!selectedFiles.value.length) return t("dms_media.picker.select");
	return t("dms_media.picker.select_count", {
		count: selectedFiles.value.length,
	});
});

const footerMeta = computed(() =>
	restricted
		? `${locationSummary.value} · ${t("dms_media.picker.restricted")}`
		: locationSummary.value,
);

function confirmIfAny(): void {
	if (isBrowseMode || renamingId.value) return;
	if (selectedFiles.value.length) confirmSelection();
}

function handleSearchEscape(event: KeyboardEvent): void {
	if (event.key !== "Escape" || !searchQuery.value) return;
	event.preventDefault();
	event.stopImmediatePropagation();
	searchQuery.value = "";
}

function handleFileInput(event: Event): void {
	const input = event.target as HTMLInputElement;
	uploadFiles([...(input.files ?? [])]);
	input.value = "";
}

function isExternalFileDrag(event: DragEvent): boolean {
	const types = Array.from(event.dataTransfer?.types ?? []);
	return types.includes("Files") && !types.includes(PICKER_INTERNAL_DRAG_TYPE);
}

function handleDragEnter(event: DragEvent): void {
	event.preventDefault();
	if (isExternalFileDrag(event)) dragDepth.value += 1;
}

function handleDragLeave(event: DragEvent): void {
	event.preventDefault();
	if (isExternalFileDrag(event)) {
		dragDepth.value = Math.max(0, dragDepth.value - 1);
	}
}

function handleDrop(event: DragEvent): void {
	event.preventDefault();
	dragDepth.value = 0;
	if (!isExternalFileDrag(event)) return;
	const files = [...(event.dataTransfer?.files ?? [])];
	if (files.length) uploadFiles(files);
}

onMounted(() => {
	window.addEventListener("keydown", handleSearchEscape, true);
	initialize();
});

onBeforeUnmount(() => {
	window.removeEventListener("keydown", handleSearchEscape, true);
});
</script>

<template>
	<div
		class="relative flex h-full min-h-0 flex-col bg-default text-default"
		@dragenter="handleDragEnter"
		@dragleave="handleDragLeave"
		@dragover.prevent
		@drop="handleDrop"
	>
		<header
			class="flex items-center gap-3 border-b border-default px-4 py-3"
		>
			<span
				class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
			>
				<UIcon name="i-ph-folder-fill" class="size-4.5" />
			</span>
			<h2 class="shrink-0 text-[15px] font-semibold text-highlighted">
				{{ props.title ?? t("dms.finder.title") }}
			</h2>
			<UInput
				v-model="searchQuery"
				icon="i-lucide-search"
				:placeholder="t('dms_media.picker.search_placeholder')"
				variant="soft"
				class="ms-auto w-full max-w-xs"
				@keydown.enter.prevent="confirmIfAny"
			>
				<template v-if="searchQuery" #trailing>
					<UButton
						icon="i-lucide-x"
						size="xs"
						variant="link"
						color="neutral"
						:aria-label="t('dms_media.picker.clear_search')"
						@click="searchQuery = ''"
					/>
				</template>
			</UInput>
			<UButton
				v-if="!isBrowseMode"
				icon="i-lucide-x"
				variant="ghost"
				color="neutral"
				square
				@click="cancel()"
			/>
		</header>

		<DmsMediaPickerToolbar />

		<div class="flex min-h-0 flex-1">
			<DmsMediaPickerSidebar />

			<UContextMenu :items="contextMenuItems" class="min-w-0 flex-1">
				<main
					class="relative flex h-full min-w-0 flex-1 flex-col"
					@contextmenu.capture="setContextTarget(null)"
				>
					<UProgress
						v-if="isLoading"
						size="xs"
						class="absolute inset-x-0 top-0 z-30"
					/>
					<div
						class="min-h-0 flex-1"
						:class="
							effectiveViewMode === 'columns'
								? 'overflow-hidden'
								: 'overflow-y-auto px-4 py-3'
						"
					>
						<div
							v-if="isSearching && !isEmpty"
							class="mb-3 flex items-center gap-1 text-[13px] text-toned"
						>
							<i18n-t
								keypath="dms_media.picker.results_count"
								:plural="visibleItems.length"
							>
								<template #count>
									<b class="font-semibold text-highlighted">
										{{ visibleItems.length }}
									</b>
								</template>
								<template #query>{{ searchQuery.trim() }}</template>
							</i18n-t>
							<UButton
								:label="t('dms_media.picker.clear_search')"
								variant="link"
								size="xs"
								class="ms-1"
								@click="searchQuery = ''"
							/>
						</div>
						<div
							v-if="isEmpty && effectiveViewMode !== 'columns'"
							class="flex h-full min-h-52 flex-col items-center justify-center gap-2 p-5 text-center"
						>
							<UIcon
								:name="isSearching ? 'i-lucide-search-x' : 'i-lucide-folder'"
								class="size-7 text-dimmed"
							/>
							<span class="text-[13px] font-semibold text-toned">
								{{ emptyTitle }}
							</span>
							<span class="text-xs text-muted">{{ emptyHint }}</span>
							<UButton
								v-if="canImportInEmpty"
								icon="i-lucide-upload"
								variant="outline"
								color="neutral"
								size="sm"
								class="mt-2"
								:label="t('dms_media.picker.import')"
								@click="fileInputRef?.click()"
							/>
						</div>
						<DmsMediaPickerGridView v-else-if="effectiveViewMode === 'grid'" />
						<DmsMediaPickerListView v-else-if="effectiveViewMode === 'list'" />
						<DmsMediaPickerColumnsView v-else />
					</div>
					<div
						v-if="dragDepth > 0"
						class="pointer-events-none absolute inset-2 z-40 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-primary/5 backdrop-blur-[2px]"
					>
						<div
							class="flex flex-col items-center gap-2 text-sm font-medium text-primary"
						>
							<UIcon name="i-lucide-upload" class="size-6" />
							{{ dropLabel }}
						</div>
					</div>
				</main>
			</UContextMenu>

			<DmsMediaPickerPreviewPane
				v-if="isPreviewOpen && effectiveViewMode !== 'columns'"
			/>
		</div>

		<footer
			class="flex items-center gap-2.5 border-t border-default px-4 py-2.5"
		>
			<UButton
				icon="i-lucide-upload"
				variant="outline"
				color="neutral"
				size="sm"
				:label="t('dms_media.picker.import')"
				@click="fileInputRef?.click()"
			/>
			<input
				ref="fileInput"
				type="file"
				multiple
				class="hidden"
				@change="handleFileInput"
			/>
			<UTooltip :text="t('dms.finder.actions.new_folder')">
				<UButton
					icon="i-lucide-folder-plus"
					variant="outline"
					color="neutral"
					size="sm"
					square
					:disabled="!isFolderLocation || isSearching"
					@click="createFolder()"
				/>
			</UTooltip>
			<span class="hidden truncate text-xs text-muted sm:block">
				{{ footerMeta }}
			</span>
			<div class="flex-1"></div>
			<div
				v-if="effectiveViewMode === 'grid' && !isEmpty"
				class="hidden items-center gap-2 text-dimmed lg:flex"
			>
				<UIcon name="i-lucide-image" class="size-3" />
				<USlider
					v-model="zoom"
					:min="PICKER_ZOOM_MIN"
					:max="PICKER_ZOOM_MAX"
					:step="1"
					size="xs"
					class="w-24"
					:aria-label="t('dms_media.picker.zoom')"
				/>
				<UIcon name="i-lucide-image" class="size-4.5" />
			</div>
			<span
				class="text-xs"
				:class="
					selectedFiles.length ? 'font-medium text-primary' : 'text-muted'
				"
			>
				{{ selectionLabel }}
			</span>
			<template v-if="!isBrowseMode">
				<UButton
					variant="ghost"
					color="neutral"
					:label="t('dms_media.picker.cancel')"
					@click="cancel()"
				/>
				<UButton
					color="primary"
					:disabled="!selectedFiles.length || Boolean(renamingId)"
					:label="confirmLabel"
					@click="confirmSelection()"
				/>
			</template>
		</footer>

		<DmsMediaPickerLightbox
			v-if="lightboxFile"
			:file="lightboxFile"
			@close="closeLightbox()"
		/>
		<DmsMediaPickerMoveDialog
			v-if="movingItem"
			:item="movingItem"
			@close="closeMove()"
		/>
		<EditImage
			v-if="editingFile"
			:file="editingFile"
			:open="true"
			@update:open="handleEditorOpenChange"
			@close="finishEdit($event)"
		/>
		<DmsMediaPickerDeleteConfirm
			v-if="deletingFile"
			:file="deletingFile"
			@close="resolveDeleteConfirm($event)"
		/>
	</div>
</template>
