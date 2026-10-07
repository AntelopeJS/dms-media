<script setup lang="ts">
import type { MediaAsset, MediaTree } from '../types/media'
import PickerModal from './picker/PickerModal.vue'
import AssetThumb from './shared/AssetThumb.vue'

const props = defineProps<{
	modelValue?: string | string[] | null
	multiple?: boolean
	max?: number
	mimetypes?: string[]
	bindingId?: string
	disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [string | string[] | null] }>()
const { t } = useI18n()
const api = useMediaApi()
const format = useMediaFormat()
const uploads = useUploadQueue()
const overlay = useOverlay()
const pickerModal = overlay.create(PickerModal)
const { emitFormChange } = useFormField()
const assets = ref<MediaAsset[]>([])
const tree = ref<MediaTree | null>(null)
const draggedIndex = ref<number | null>(null)
const isDropping = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const ids = computed<string[]>(() => {
	if (!props.modelValue) return []
	return typeof props.modelValue === 'string' ? [props.modelValue] : props.modelValue
})
const boundFolder = computed(() => tree.value?.folders.find((folder) => props.bindingId && folder.binding === props.bindingId))
const isFull = computed(() => (props.multiple ? props.max !== undefined && ids.value.length >= props.max : false))
const remaining = computed(() => (props.max === undefined ? undefined : Math.max(props.max - ids.value.length, 0)))
const kind = computed(() => {
	const accept = props.mimetypes ?? []
	if (accept.length && accept.every((pattern) => pattern.startsWith('image/'))) return 'image'
	if (accept.length === 1 && accept[0] === 'application/pdf') return 'pdf'
	return 'file'
})
const missingAlt = computed(() => assets.value.filter(needsAltText).length)

async function loadAssets(list: string[]): Promise<void> {
	const known = new Map(assets.value.map((asset) => [asset.id, asset]))
	const loaded = await Promise.all(
		list.map(async (id) => known.get(id) ?? (await api.asset(id).then((response) => response.asset).catch(() => null))),
	)
	assets.value = loaded.filter((asset): asset is MediaAsset => asset !== null)
}

watch(ids, (list) => void loadAssets(list), { immediate: true })
onMounted(async () => {
	tree.value = await api.tree().catch(() => null)
})

function commit(next: string[]): void {
	if (props.multiple) emit('update:modelValue', next)
	else emit('update:modelValue', next[0] ?? null)
	emitFormChange()
}

async function openPicker(): Promise<void> {
	if (props.disabled) return
	const picked = await pickerModal.open({
		multiple: props.multiple,
		max: props.max,
		current: props.multiple ? ids.value.length : 0,
		accept: props.mimetypes,
		startFolderId: boundFolder.value?.id,
	})
	if (!picked || picked.length === 0) return
	assets.value = props.multiple ? [...assets.value, ...picked] : picked
	commit(props.multiple ? [...new Set([...ids.value, ...picked.map((asset) => asset.id)])] : [picked[0]!.id])
}

function remove(id: string): void {
	assets.value = assets.value.filter((asset) => asset.id !== id)
	commit(ids.value.filter((entry) => entry !== id))
}

function onDragStart(index: number): void {
	draggedIndex.value = index
}

function onDropOn(index: number): void {
	const from = draggedIndex.value
	draggedIndex.value = null
	if (from === null || from === index) return
	const next = [...ids.value]
	const [moved] = next.splice(from, 1)
	next.splice(index, 0, moved!)
	commit(next)
}

function uploadTarget(): { folderId: string; folderName: string } | null {
	const folder = boundFolder.value
	return folder?.rights.write ? { folderId: folder.id, folderName: folder.name } : null
}

function uploadFiles(files: File[]): void {
	const target = uploadTarget()
	if (!target || files.length === 0) return
	const allowed = props.multiple ? files.slice(0, remaining.value ?? files.length) : files.slice(0, 1)
	const batchId = uploads.enqueue(allowed, target)
	const stop = uploads.onUploaded((asset) => {
		if (!uploads.items.value.some((item) => item.batchId === batchId && item.asset?.id === asset.id)) return
		assets.value = props.multiple ? [...assets.value, asset] : [asset]
		commit(props.multiple ? [...ids.value, asset.id] : [asset.id])
		if (!uploads.items.value.some((item) => item.batchId === batchId && (item.status === 'waiting' || item.status === 'uploading' || item.status === 'checking'))) stop()
	})
}

function onDrop(event: DragEvent): void {
	isDropping.value = false
	const files = Array.from(event.dataTransfer?.files ?? [])
	if (files.length === 0 || props.disabled) return
	event.preventDefault()
	uploadFiles(files)
}

function onFilesChosen(event: Event): void {
	const input = event.target as HTMLInputElement
	uploadFiles(Array.from(input.files ?? []))
	input.value = ''
}
</script>

<template>
	<div class="flex flex-col gap-2" @dragover.prevent="isDropping = Boolean(uploadTarget())" @dragleave="isDropping = false" @drop="onDrop">
		<template v-if="!multiple && assets[0]">
			<div class="border-default flex items-center gap-3 rounded-md border p-2.5" :class="disabled && 'opacity-60'">
				<AssetThumb :asset="assets[0]" size="md" />
				<div class="min-w-0 flex-1">
					<p class="text-highlighted truncate text-sm font-medium">{{ assets[0].name }}</p>
					<p class="text-dimmed flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
						<span v-if="assets[0].width">{{ format.formatDimensions(assets[0].width, assets[0].height) }} ·</span>
						<span>{{ format.formatBytes(assets[0].size) }} ·</span>
						<span :class="assets[0].effectiveVisibility === 'public' ? 'text-success' : ''">{{ t(`dms_media.visibility.${assets[0].effectiveVisibility}`) }}</span>
						<span v-if="needsAltText(assets[0])" class="text-warning">· {{ t('dms_media.markers.no_alt') }}</span>
					</p>
				</div>
				<template v-if="!disabled">
					<UButton v-if="isEditableAsset(assets[0])" icon="i-ph-crop" color="neutral" variant="outline" size="sm" :label="t('dms_media.field_widget.crop')" :to="editorLink(assets[0].id)" target="_blank" />
					<UButton icon="i-ph-swap" color="neutral" variant="outline" size="sm" :label="t('dms_media.field_widget.replace')" @click="openPicker" />
					<UButton icon="i-ph-x" color="neutral" variant="ghost" size="sm" square :aria-label="t('dms_media.field_widget.remove', { name: assets[0].name })" @click="remove(assets[0].id)" />
				</template>
			</div>
		</template>
		<template v-else-if="multiple && assets.length">
			<div class="flex items-center justify-between">
				<span />
				<span v-if="max !== undefined" class="text-dimmed font-mono text-[11px]">{{ t('dms_media.field_widget.count', { count: assets.length, max }) }}</span>
			</div>
			<ul class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
				<li
					v-for="(asset, index) in assets"
					:key="asset.id"
					class="group relative overflow-hidden rounded-md"
					:class="draggedIndex === index && 'opacity-50'"
					:draggable="!disabled"
					@dragstart="onDragStart(index)"
					@dragover.prevent
					@drop.stop="onDropOn(index)"
				>
					<AssetThumb :asset="asset" size="fill" class="aspect-square" />
					<span class="absolute start-1.5 top-1.5 rounded-sm bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
						{{ index === 0 ? t('dms_media.field_widget.cover') : index + 1 }}
					</span>
					<span v-if="needsAltText(asset)" class="text-warning absolute end-1.5 bottom-1.5 rounded-sm bg-black/60 px-1 text-[10px]">Aa</span>
					<UButton
						v-if="!disabled"
						icon="i-ph-x"
						color="neutral"
						variant="solid"
						size="xs"
						square
						class="absolute end-1.5 top-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
						:aria-label="t('dms_media.field_widget.remove', { name: asset.name })"
						@click="remove(asset.id)"
					/>
				</li>
				<li v-if="!disabled && !isFull">
					<button
						type="button"
						class="text-muted hover:text-highlighted flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-(--ui-border-accented) text-[12px]"
						@click="openPicker"
					>
						<UIcon name="i-ph-plus" class="size-5" />
						{{ t(`dms_media.field_widget.add_${kind}`) }}
						<span v-if="remaining !== undefined" class="text-dimmed font-mono text-[11px]">{{ t('dms_media.field_widget.left', { count: remaining }) }}</span>
					</button>
				</li>
			</ul>
			<p class="text-dimmed text-[12px]">
				{{ t('dms_media.field_widget.reorder_hint') }}
				<span v-if="missingAlt" class="text-warning">{{ t('dms_media.field_widget.missing_alt', { count: missingAlt }, missingAlt) }}</span>
			</p>
		</template>
		<button
			v-else
			type="button"
			:disabled="disabled"
			class="flex items-center gap-3 rounded-md border border-dashed p-3 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-60"
			:class="isDropping ? 'border-(--ui-primary) bg-(--dms-accent-tint)' : 'border-(--ui-border-accented) hover:bg-(--dms-bg-muted)'"
			@click="openPicker"
		>
			<DmsIconWell :icon="kind === 'pdf' ? 'i-ph-file-pdf' : kind === 'image' ? 'i-ph-image' : 'i-ph-file'" tone="primary" />
			<span class="min-w-0 flex-1">
				<span class="text-highlighted block text-sm font-medium">{{ t(`dms_media.field_widget.choose_${kind}`) }}</span>
				<span class="text-muted block text-[12px]">
					{{ boundFolder?.rights.write ? t('dms_media.field_widget.choose_hint_upload', { name: boundFolder.name }) : t('dms_media.field_widget.choose_hint') }}
				</span>
			</span>
			<span class="text-highlighted border-default flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[13px] font-medium">
				<UIcon name="i-ph-folder-open" class="size-4" />{{ t('dms_media.field_widget.browse') }}
			</span>
		</button>
		<UButton
			v-if="!disabled && uploadTarget() && !isFull && (multiple || !assets.length)"
			icon="i-ph-upload-simple"
			color="neutral"
			variant="link"
			size="xs"
			class="self-start"
			:label="t('dms_media.field_widget.upload_to', { name: boundFolder?.name })"
			@click="fileInput?.click()"
		/>
		<input ref="fileInput" type="file" :multiple="multiple" :accept="mimetypes?.join(',')" class="hidden" @change="onFilesChosen" />
	</div>
</template>
