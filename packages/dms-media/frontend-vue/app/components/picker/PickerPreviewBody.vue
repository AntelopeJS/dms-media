<script setup lang="ts">
import type { FileItemPublic } from "../../utils/finder/models";
import { formatFileSize } from "../../utils/finder/filesize";
import { formatRelativeDate } from "../../utils/finder/formatter";
import { resolveFileGroup } from "../../utils/finder/filegroup";
import { getExtensionLabel } from "../../utils/finder/mime";
import { usePickerExplorer } from "../../composables/picker/usePickerExplorer";

interface Props {
	file: FileItemPublic;
}

const props = defineProps<Props>();

const { t } = useI18n();
const {
	pathLabel,
	downloadFile,
	requestDeleteFile,
	previewFile,
	isImageFile,
	editFile,
} = usePickerExplorer();

const group = computed(() => resolveFileGroup(props.file.mimetype));
const typeValue = computed(
	() =>
		`${t(group.value.labelKey)} · ${getExtensionLabel(props.file.mimetype).toUpperCase()}`,
);

interface PreviewMetaRow {
	label: string;
	value: string;
}

const metaRows = computed<PreviewMetaRow[]>(() => [
	{ label: t("dms.finder.details.type"), value: typeValue.value },
	{
		label: t("dms.finder.details.size"),
		value: formatFileSize(props.file.size),
	},
	{
		label: t("dms.finder.details.modified"),
		value: formatRelativeDate(props.file.updatedAt, t),
	},
]);
</script>

<template>
	<div class="flex flex-col">
		<button
			class="relative aspect-[4/3] w-full cursor-zoom-in overflow-hidden rounded-xl bg-elevated shadow-sm"
			type="button"
			@click="previewFile(file)"
		>
			<DmsMediaPickerItemThumb :item="file" />
		</button>
		<div class="mt-3.5 text-center text-sm font-semibold break-words text-highlighted">
			{{ file.name }}
		</div>
		<div class="mt-1 text-center text-xs text-muted">
			{{ pathLabel(file) }}
		</div>
		<div class="mt-4 border-t border-default">
			<div
				v-for="row in metaRows"
				:key="row.label"
				class="flex items-center justify-between gap-3 border-b border-default py-2 text-xs"
			>
				<span class="text-muted">{{ row.label }}</span>
				<span class="text-right font-medium text-highlighted">
					{{ row.value }}
				</span>
			</div>
		</div>
		<div class="mt-4 flex justify-center gap-2">
			<UTooltip
				v-if="isImageFile(file)"
				:text="t('dms.finder.actions.edit_image')"
			>
				<UButton
					icon="i-lucide-crop"
					variant="outline"
					color="neutral"
					square
					@click="editFile(file)"
				/>
			</UTooltip>
			<UTooltip :text="t('dms.finder.actions.download')">
				<UButton
					icon="i-lucide-download"
					variant="outline"
					color="neutral"
					square
					@click="downloadFile(file)"
				/>
			</UTooltip>
			<UTooltip :text="t('dms.finder.actions.delete')">
				<UButton
					icon="i-lucide-trash-2"
					variant="outline"
					color="error"
					square
					@click="requestDeleteFile(file)"
				/>
			</UTooltip>
		</div>
	</div>
</template>
