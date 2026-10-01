<script setup lang="ts">
import PickerModal from "./PickerModal.vue";
import { getExtensionIcon, getExtensionLabel } from "../utils/finder/mime";
import { formatFileSize } from "../utils/finder/filesize";
import type { MediaAssetDto } from "../composables/finder/api/useMediaApi";

interface Props {
	modelValue?: string | string[] | null;
	multiple?: boolean;
	max?: number;
	mimetypes?: string[];
	bindingId?: string;
	disabled?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	"update:modelValue": [string | string[] | null];
}>();

const { t } = useI18n();
const toast = useToast();
const api = useMediaApi();
const { emitFormChange } = useFormField();

const overlay = useOverlay();
const pickerModal = overlay.create(PickerModal);

const selectedAssets = ref<MediaAssetDto[]>([]);
const previewUrls = ref<Record<string, string>>({});

const selectedIds = computed<string[]>(() => {
	if (!props.modelValue) return [];
	return typeof props.modelValue === "string"
		? [props.modelValue]
		: props.modelValue;
});

const singleAsset = computed(() => selectedAssets.value[0]);

const isImageOnly = computed(() => {
	const mimetypes = props.mimetypes ?? [];
	return (
		mimetypes.length > 0 &&
		mimetypes.every((pattern) => pattern.startsWith("image/"))
	);
});

const emptyLabel = computed(() =>
	t(
		isImageOnly.value
			? "dms_media.picker.field_empty_image"
			: "dms_media.picker.field_empty_file",
	),
);

function assetSubtitle(asset: MediaAssetDto): string {
	const extension = getExtensionLabel(asset.mimetype).toUpperCase();
	return `${extension} · ${formatFileSize(asset.size)}`;
}

async function loadSelectedAssets(ids: string[]): Promise<void> {
	const assets: MediaAssetDto[] = [];
	for (const id of ids) {
		try {
			const { asset } = await api.fetchAsset(id);
			assets.push(asset);
		} catch {
			continue;
		}
	}
	selectedAssets.value = assets;
	await loadPreviews(assets);
}

async function loadPreviews(assets: MediaAssetDto[]): Promise<void> {
	const imageIds = assets
		.filter((asset) => asset.mimetype.startsWith("image/"))
		.map((asset) => asset.id);
	if (!imageIds.length) return;
	try {
		const { previews } = await api.fetchPreviews(imageIds);
		previewUrls.value = { ...previewUrls.value, ...previews };
	} catch {
		return;
	}
}

watch(selectedIds, (ids) => loadSelectedAssets(ids), { immediate: true });

function applySelection(ids: string[]): void {
	if (!props.multiple) {
		emit("update:modelValue", ids[0] ?? null);
	} else {
		const limited = props.max !== undefined ? ids.slice(0, props.max) : ids;
		if (limited.length < ids.length) {
			toast.add({
				title: t("dms_media.picker.max_reached", { count: props.max }),
				color: "warning",
				icon: "i-lucide-triangle-alert",
			});
		}
		emit("update:modelValue", limited);
	}
	emitFormChange();
}

function removeAsset(id: string): void {
	if (!props.multiple) {
		emit("update:modelValue", null);
	} else {
		emit("update:modelValue", selectedIds.value.filter((v) => v !== id));
	}
	emitFormChange();
}

async function openPicker(): Promise<void> {
	if (props.disabled) return;
	const files = await pickerModal.open({
		bindingId: props.bindingId,
		mimetypes: props.mimetypes,
		multiple: props.multiple,
		initialSelectedIds: selectedIds.value,
	});
	if (!files?.length) return;
	applySelection(files.map((file) => file.id));
}
</script>

<template>
	<div v-if="!multiple">
		<div
			v-if="!singleAsset"
			class="group flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-accented bg-elevated/30 p-3 transition-colors hover:border-primary hover:bg-primary/5"
			:class="disabled ? 'pointer-events-none opacity-50' : ''"
			role="button"
			tabindex="0"
			@click="openPicker"
			@keydown.enter="openPicker"
		>
			<span
				class="grid size-10 shrink-0 place-items-center rounded-lg bg-elevated text-muted transition-colors group-hover:bg-default group-hover:text-primary"
			>
				<UIcon
					:name="isImageOnly ? 'i-lucide-image' : 'i-lucide-file'"
					class="size-5"
				/>
			</span>
			<span class="min-w-0 flex-1">
				<span
					class="block truncate text-sm font-medium text-toned transition-colors group-hover:text-primary"
				>
					{{ emptyLabel }}
				</span>
				<span class="block truncate text-xs text-muted">
					{{ t("dms_media.picker.field_empty_hint") }}
				</span>
			</span>
			<UButton
				icon="i-lucide-folder"
				variant="outline"
				color="neutral"
				size="sm"
				:label="t('dms_media.picker.field_browse')"
				@click.stop="openPicker"
			/>
		</div>
		<div
			v-else
			class="flex items-center gap-3 rounded-lg border border-default bg-default p-3"
		>
			<span
				class="relative size-11 shrink-0 overflow-hidden rounded-lg bg-elevated shadow-sm"
			>
				<img
					v-if="previewUrls[singleAsset.id]"
					:src="previewUrls[singleAsset.id]"
					:alt="singleAsset.alt ?? singleAsset.name"
					class="size-full object-cover"
				/>
				<span v-else class="grid size-full place-items-center text-muted">
					<UIcon :name="getExtensionIcon(singleAsset.mimetype)" class="size-5" />
				</span>
			</span>
			<span class="min-w-0 flex-1">
				<span class="block truncate text-sm font-medium text-highlighted">
					{{ singleAsset.name }}
				</span>
				<span class="block truncate text-xs text-muted">
					{{ assetSubtitle(singleAsset) }}
				</span>
			</span>
			<span v-if="!disabled" class="flex shrink-0 gap-1.5">
				<UTooltip :text="t('dms_media.picker.field_replace')">
					<UButton
						icon="i-lucide-arrow-left-right"
						variant="outline"
						color="neutral"
						size="sm"
						square
						@click="openPicker"
					/>
				</UTooltip>
				<UTooltip :text="t('dms_media.picker.field_remove')">
					<UButton
						icon="i-lucide-x"
						variant="outline"
						color="neutral"
						size="sm"
						square
						@click="removeAsset(singleAsset.id)"
					/>
				</UTooltip>
			</span>
		</div>
	</div>
	<div v-else class="flex flex-col gap-2">
		<div
			v-for="asset in selectedAssets"
			:key="asset.id"
			class="flex items-center gap-2.5 rounded-lg border border-default bg-default px-2.5 py-2"
		>
			<span
				class="relative size-9 shrink-0 overflow-hidden rounded-md bg-elevated shadow-sm"
			>
				<img
					v-if="previewUrls[asset.id]"
					:src="previewUrls[asset.id]"
					:alt="asset.alt ?? asset.name"
					class="size-full object-cover"
				/>
				<span v-else class="grid size-full place-items-center text-muted">
					<UIcon :name="getExtensionIcon(asset.mimetype)" class="size-4.5" />
				</span>
			</span>
			<span class="min-w-0 flex-1">
				<span class="block truncate text-[13px] font-medium text-highlighted">
					{{ asset.name }}
				</span>
				<span class="block truncate text-xs text-muted">
					{{ assetSubtitle(asset) }}
				</span>
			</span>
			<UTooltip v-if="!disabled" :text="t('dms_media.picker.field_remove')">
				<UButton
					icon="i-lucide-x"
					variant="ghost"
					color="neutral"
					size="xs"
					square
					@click="removeAsset(asset.id)"
				/>
			</UTooltip>
		</div>
		<button
			class="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-accented bg-elevated/30 text-[13px] font-medium text-muted transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
			:class="disabled ? 'pointer-events-none opacity-50' : ''"
			type="button"
			@click="openPicker"
		>
			<UIcon name="i-lucide-plus" class="size-4" />
			{{
				t(
					selectedAssets.length
						? "dms_media.picker.field_manage"
						: "dms_media.picker.field_add",
				)
			}}
		</button>
	</div>
</template>
