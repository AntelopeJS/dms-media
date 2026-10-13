<script setup lang="ts">
import { defaultWindow, useEventListener } from '@vueuse/core'
import type { MediaAsset, MediaFolder } from '../types/media'
import FieldEntries from './field/FieldEntries.vue'
import FieldSingleCard from './field/FieldSingleCard.vue'
import FieldUploadList from './field/FieldUploadList.vue'
import type { PickerResult } from './picker/PickerModal.vue'
import PickerModal from './picker/PickerModal.vue'
import MediaLightbox from './shared/MediaLightbox.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
	/** The form field's id, which its label points to. */
	id?: string
	modelValue?: string | string[] | null
	multiple?: boolean
	max?: number
	mimetypes?: string[]
	bindingId?: string
	disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [string | string[] | null] }>()

type FieldKind = 'image' | 'pdf' | 'file'
type DropMode = 'upload' | 'replace' | 'no_folder' | 'full'

const KIND_ICONS: Record<FieldKind, string> = {
	image: 'i-ph-image',
	pdf: 'i-ph-file-pdf',
	file: 'i-ph-file',
}
const ACCEPTED_DROPS = new Set<DropMode>(['upload', 'replace'])
/** The folder each field last showed in its picker, for the next opening. */
const lastFolderByField = new Map<string, string>()

const { t } = useI18n()
const toast = useToast()
const overlay = useOverlay()
const pickerModal = overlay.create(PickerModal)
const lightbox = overlay.create(MediaLightbox)
const field = useFormField(props)
const attrs = useAttrs()
const { tree, reload: reloadTree } = useSharedTree()
const root = useTemplateRef<HTMLElement>('root')
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const dragDepth = ref(0)
const announcement = ref('')

const ids = computed<string[]>(() => {
	if (!props.modelValue) return []
	return typeof props.modelValue === 'string'
		? [props.modelValue]
		: props.modelValue
})
const { entries, remember } = useAssetFieldEntries(ids)
const foldersById = computed(
	() =>
		new Map((tree.value?.folders ?? []).map((folder) => [folder.id, folder])),
)
const boundFolder = computed(() =>
	tree.value?.folders.find(
		(folder) => props.bindingId && folder.binding === props.bindingId,
	),
)
const room = computed(() => {
	if (!props.multiple) return 1
	return props.max === undefined
		? undefined
		: Math.max(props.max - ids.value.length, 0)
})
const isFull = computed(() => props.multiple && room.value === 0)
const kind = computed<FieldKind>(() => {
	const accept = props.mimetypes ?? []
	if (accept.length && accept.every((pattern) => pattern.startsWith('image/')))
		return 'image'
	if (accept.length === 1 && accept[0] === 'application/pdf') return 'pdf'
	return 'file'
})
const isError = computed(() => field.color.value === 'error')
const missingAlt = computed(
	() =>
		entries.value.filter((entry) => entry.asset && needsAltText(entry.asset))
			.length,
)
const fieldKey = computed(() => field.name.value ?? props.bindingId ?? '')

const uploads = useAssetFieldUploads({
	accept: () => props.mimetypes,
	destination: () => uploadTarget(),
	room: () => room.value,
	onUploaded: addUploaded,
})

function uploadTarget(): { folderId: string; folderName: string } | null {
	const folder = boundFolder.value
	return folder?.rights.write
		? { folderId: folder.id, folderName: folder.name }
		: null
}

function commit(next: string[]): void {
	emit('update:modelValue', props.multiple ? next : (next[0] ?? null))
	field.emitFormChange()
}

function addUploaded(asset: MediaAsset): void {
	remember(asset)
	if (!props.multiple) return replaceWith(asset)
	if (room.value === 0) return
	commit([...ids.value, asset.id])
}

/** A single field given a new file by upload: the old one can be put back. */
function replaceWith(asset: MediaAsset): void {
	const previous = entries.value[0]
	commit([asset.id])
	if (!previous) return
	toast.add({
		title: t('dms_media.field_widget.replaced', { name: asset.name }),
		color: 'neutral',
		icon: 'i-ph-swap',
		actions: [
			{
				label: t('dms_media.field_widget.undo'),
				color: 'neutral',
				variant: 'outline',
				onClick: () => commit([previous.id]),
			},
		],
	})
}

function canEditAlt(asset: MediaAsset): boolean {
	return Boolean(foldersById.value.get(asset.folderId)?.rights.write)
}

function onAltSaved(asset: MediaAsset): void {
	remember(asset)
}

/** Where a field without a linked folder opens: where it was last, its first file's folder, or the first folder the user can open. */
function startFolderOf(): string | undefined {
	if (boundFolder.value) return boundFolder.value.id
	const remembered = lastFolderByField.get(fieldKey.value)
	if (remembered && foldersById.value.has(remembered)) return remembered
	const firstFolder = entries.value.find((entry) => entry.asset)?.asset
		?.folderId
	if (firstFolder && foldersById.value.has(firstFolder)) return firstFolder
	if (tree.value?.root.write) return undefined
	return firstOpenFolder(tree.value?.folders ?? [])?.id
}

function firstOpenFolder(folders: MediaFolder[]): MediaFolder | undefined {
	const depthOf = (folder: MediaFolder) =>
		folderAncestors(folder, foldersById.value).length
	return folders
		.filter((folder) => !folder.shell)
		.sort((left, right) => depthOf(left) - depthOf(right))[0]
}

async function openPicker(): Promise<void> {
	if (props.disabled) return
	if (!tree.value) await reloadTree()
	const trigger =
		document.activeElement instanceof HTMLElement
			? document.activeElement
			: null
	const result: PickerResult | null = await pickerModal.open({
		multiple: props.multiple,
		max: props.max,
		current: props.multiple ? ids.value.length : 0,
		accept: props.mimetypes,
		startFolderId: startFolderOf(),
		scopeFolderId: boundFolder.value?.id,
		alreadyPicked: props.multiple ? ids.value : [],
		returnFocus: () => focusControl(trigger),
	})
	if (result?.folderId) lastFolderByField.set(fieldKey.value, result.folderId)
	if (result?.assets.length) applyPicked(result.assets)
}

/** Back to what opened the picker, or to the field's control when that is gone. */
function focusControl(trigger: HTMLElement | null): void {
	const control = field.id.value
		? document.getElementById(field.id.value)
		: null
	const isTriggerHere = Boolean(
		trigger?.isConnected && root.value?.contains(trigger),
	)
	;(isTriggerHere
		? trigger
		: (control ?? root.value?.querySelector<HTMLElement>('button'))
	)?.focus()
}

function applyPicked(picked: MediaAsset[]): void {
	picked.forEach(remember)
	if (!props.multiple) return commit([picked[0]!.id])
	const added = picked
		.map((asset) => asset.id)
		.filter((id) => !ids.value.includes(id))
	commit([...ids.value, ...added])
}

function remove(id: string): void {
	commit(ids.value.filter((entry) => entry !== id))
}

function move(from: number, to: number): void {
	const next = [...ids.value]
	const [moved] = next.splice(from, 1)
	next.splice(to, 0, moved!)
	const name = entries.value[from]?.asset?.name ?? ''
	commit(next)
	announcement.value = t('dms_media.field_widget.moved', {
		name,
		index: to + 1,
		total: next.length,
	})
}

function preview(id: string): void {
	const assets = entries.value.flatMap((entry) =>
		entry.asset ? [entry.asset] : [],
	)
	void lightbox.open({ assets, startId: id, canEdit: () => false })
}

const dropMode = computed<DropMode | null>(() => {
	if (props.disabled) return null
	if (!uploadTarget()) return 'no_folder'
	if (isFull.value) return 'full'
	return !props.multiple && entries.value.length ? 'replace' : 'upload'
})
const isDragging = computed(
	() => dragDepth.value > 0 && dropMode.value !== null,
)

function hasFiles(event: DragEvent): boolean {
	return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function onDragEnter(event: DragEvent): void {
	if (hasFiles(event)) dragDepth.value += 1
}

function onDragLeave(event: DragEvent): void {
	if (hasFiles(event)) dragDepth.value = Math.max(dragDepth.value - 1, 0)
}

function onDragOver(event: DragEvent): void {
	if (
		!hasFiles(event) ||
		!dropMode.value ||
		!ACCEPTED_DROPS.has(dropMode.value)
	)
		return
	event.preventDefault()
	if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onDrop(event: DragEvent): void {
	dragDepth.value = 0
	const files = Array.from(event.dataTransfer?.files ?? [])
	if (files.length === 0) return
	event.preventDefault()
	void uploads.upload(files)
}

/** A file dropped beside every drop zone would replace the page with it, losing the form. */
function guardPage(event: DragEvent): void {
	if (!hasFiles(event) || event.defaultPrevented) return
	event.preventDefault()
	if (event.dataTransfer && event.type === 'dragover')
		event.dataTransfer.dropEffect = 'none'
}

/** However a drag ends, on the field or anywhere else, the drop layer goes. */
function endDrag(): void {
	dragDepth.value = 0
}

useEventListener(defaultWindow, 'dragover', guardPage)
useEventListener(defaultWindow, 'drop', guardPage)
useEventListener(defaultWindow, 'drop', endDrag, { capture: true })
useEventListener(defaultWindow, 'dragend', endDrag, { capture: true })

function onFilesChosen(event: Event): void {
	const input = event.target as HTMLInputElement
	void uploads.upload(Array.from(input.files ?? []))
	input.value = ''
}

const chooseLabel = computed(() => {
	if (!props.multiple) return t(`dms_media.field_widget.choose_${kind.value}`)
	if (props.max === undefined)
		return t(`dms_media.field_widget.choose_many_${kind.value}`)
	return t(
		`dms_media.field_widget.choose_up_to_${kind.value}`,
		{ count: props.max },
		props.max,
	)
})
const chooseHint = computed(() => {
	const folder = uploadTarget()
	if (!folder) return t('dms_media.field_widget.choose_hint')
	return t(
		'dms_media.field_widget.choose_hint_drop',
		{ name: folder.folderName },
		props.multiple ? 2 : 1,
	)
})
const dropText = computed(() => {
	const mode = dropMode.value
	if (mode === 'replace')
		return t('dms_media.field_widget.drop.replace', {
			name: entries.value[0]?.asset?.name ?? '',
		})
	if (mode === 'upload')
		return t(
			'dms_media.field_widget.drop.upload',
			{ name: uploadTarget()?.folderName ?? '' },
			props.multiple ? 2 : 1,
		)
	return mode ? t(`dms_media.field_widget.drop.${mode}`) : ''
})
</script>

<template>
	<div
		ref="root"
		class="relative flex flex-col gap-2"
		:class="attrs.class"
		@dragenter="onDragEnter"
		@dragleave="onDragLeave"
		@dragover="onDragOver"
		@drop="onDrop"
	>
		<FieldSingleCard
			v-if="!multiple && entries[0]"
			:entry="entries[0]"
			:disabled="disabled"
			:can-edit-alt="canEditAlt"
			:control-id="field.id.value"
			:control-aria="field.ariaAttrs.value"
			:class="isError && 'border-(--ui-error)'"
			@replace="openPicker"
			@remove="remove(entries[0].id)"
			@preview="preview(entries[0].id)"
			@alt-saved="onAltSaved"
		/>
		<template v-else-if="multiple && entries.length">
			<p v-if="max !== undefined" class="text-dimmed font-mono text-[11px]">
				{{ t('dms_media.field_widget.count', { count: entries.length, max }) }}
			</p>
			<FieldEntries
				:entries="entries"
				:layout="kind === 'image' ? 'grid' : 'list'"
				:has-cover="kind === 'image'"
				:disabled="disabled"
				:can-edit-alt="canEditAlt"
				@move="move"
				@remove="remove"
				@preview="preview"
				@alt-saved="onAltSaved"
			>
				<template #after>
					<li :class="kind === 'image' ? '' : 'list-none'">
						<button
							:id="field.id.value"
							type="button"
							v-bind="field.ariaAttrs.value"
							:disabled="disabled || isFull"
							class="text-muted enabled:hover:text-highlighted border-(--ui-border-accented) flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed text-[12px] disabled:cursor-not-allowed disabled:opacity-60"
							:class="kind === 'image' ? 'aspect-square flex-col' : 'px-3 py-2'"
							@click="openPicker"
						>
							<UIcon
								:name="isFull ? 'i-ph-check' : 'i-ph-plus'"
								class="size-5"
							/>
							{{
								isFull
									? t('dms_media.field_widget.full')
									: t(`dms_media.field_widget.add_${kind}`)
							}}
							<span
								v-if="room !== undefined && !isFull"
								class="text-dimmed font-mono text-[11px]"
							>
								{{ t('dms_media.field_widget.left', { count: room }) }}
							</span>
						</button>
					</li>
				</template>
			</FieldEntries>
			<p
				v-if="kind === 'image' || missingAlt"
				class="text-dimmed flex flex-wrap gap-x-1.5 text-[12px]"
			>
				<span v-if="kind === 'image'">
					{{ t('dms_media.field_widget.reorder_hint_cover') }}
				</span>
				<span v-if="missingAlt" class="text-warning">
					{{
						t(
							'dms_media.field_widget.missing_alt',
							{ count: missingAlt },
							missingAlt,
						)
					}}
				</span>
			</p>
		</template>
		<button
			v-else
			:id="field.id.value"
			type="button"
			v-bind="field.ariaAttrs.value"
			:disabled="disabled"
			class="flex flex-wrap items-center gap-3 rounded-md border border-dashed p-3 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-60"
			:class="
				isError
					? 'border-(--ui-error)'
					: 'border-(--ui-border-accented) hover:bg-(--dms-bg-muted)'
			"
			@click="openPicker"
		>
			<DmsIconWell :icon="KIND_ICONS[kind]" tone="primary" />
			<span class="min-w-0 flex-1 basis-40">
				<span class="text-highlighted block text-sm font-medium">
					{{ chooseLabel }}
				</span>
				<span class="text-muted block text-[12px]">{{ chooseHint }}</span>
			</span>
			<span
				class="text-highlighted border-default flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[13px] font-medium"
			>
				<UIcon name="i-ph-folder-open" class="size-4" />
				{{ t('dms_media.field_widget.browse') }}
			</span>
		</button>
		<FieldUploadList
			v-if="uploads.items.value.length"
			:items="uploads.items.value"
			:failure-text="uploads.failureText"
			:is-failed="uploads.isFailed"
			@retry="uploads.retry"
			@cancel="uploads.cancel"
			@dismiss="uploads.dismiss"
		/>
		<UButton
			v-if="
				!disabled && uploadTarget() && !isFull && (multiple || !entries.length)
			"
			icon="i-ph-upload-simple"
			color="neutral"
			variant="link"
			size="xs"
			class="self-start"
			:label="
				t('dms_media.field_widget.upload_to', { name: boundFolder?.name })
			"
			@click="fileInput?.click()"
		/>
		<input
			ref="fileInput"
			type="file"
			:multiple="multiple"
			:accept="mimetypes?.join(',')"
			class="hidden"
			@change="onFilesChosen"
		/>
		<div
			v-if="isDragging"
			class="pointer-events-none absolute -inset-1 z-10 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 text-center text-sm font-medium backdrop-blur-[2px]"
			:class="
				dropMode && ACCEPTED_DROPS.has(dropMode)
					? 'border-(--ui-primary) bg-(--dms-accent-tint)/90 text-highlighted'
					: 'border-(--ui-border-accented) bg-(--dms-bg-muted)/90 text-muted'
			"
		>
			<UIcon
				:name="
					dropMode && ACCEPTED_DROPS.has(dropMode)
						? 'i-ph-cloud-arrow-up'
						: 'i-ph-prohibit'
				"
				class="size-5 shrink-0"
			/>
			{{ dropText }}
		</div>
		<p class="sr-only" aria-live="polite">{{ announcement }}</p>
	</div>
</template>
