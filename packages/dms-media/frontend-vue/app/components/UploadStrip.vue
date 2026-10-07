<script setup lang="ts">
import DestinationDialog from './dialogs/DestinationDialog.vue'
import type { MediaTree } from '../types/media'

const api = useMediaApi()
const uploads = useUploadQueue()
const overlay = useOverlay()
const destinationDialog = overlay.create(DestinationDialog)
const { prefs, update } = useMediaPrefs()
const { t } = useI18n()
const toast = useToast()
const tree = ref<MediaTree | null>(null)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const isDragging = ref(false)
let dragDepth = 0

const foldersById = computed(() => new Map((tree.value?.folders ?? []).map((folder) => [folder.id, folder])))
const writable = computed(() => (tree.value?.folders ?? []).filter((folder) => folder.rights.write))
const destination = computed(() => {
	const remembered = prefs.value.lastFolderId ? foldersById.value.get(prefs.value.lastFolderId) : undefined
	return remembered?.rights.write ? remembered : undefined
})
const parentPath = computed(() =>
	folderAncestors(destination.value, foldersById.value).slice(0, -1).map((folder) => folder.name).join(' › '),
)

onMounted(async () => {
	tree.value = await api.tree().catch(() => null)
	if (tree.value) uploads.maxUploadBytes.value = tree.value.maxUploadBytes
	window.addEventListener('dragenter', onDragEnter)
	window.addEventListener('dragleave', onDragLeave)
	window.addEventListener('dragover', onDragOver)
	window.addEventListener('drop', onDrop)
})

onBeforeUnmount(() => {
	window.removeEventListener('dragenter', onDragEnter)
	window.removeEventListener('dragleave', onDragLeave)
	window.removeEventListener('dragover', onDragOver)
	window.removeEventListener('drop', onDrop)
})

function hasFiles(event: DragEvent): boolean {
	return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function onDragEnter(event: DragEvent): void {
	if (!hasFiles(event)) return
	dragDepth += 1
	isDragging.value = true
}

function onDragLeave(event: DragEvent): void {
	if (!hasFiles(event)) return
	dragDepth = Math.max(dragDepth - 1, 0)
	if (dragDepth === 0) isDragging.value = false
}

function onDragOver(event: DragEvent): void {
	if (hasFiles(event) && writable.value.length) event.preventDefault()
}

async function onDrop(event: DragEvent): Promise<void> {
	dragDepth = 0
	isDragging.value = false
	const files = Array.from(event.dataTransfer?.files ?? [])
	if (!files.length || !writable.value.length) return
	event.preventDefault()
	const target = destination.value ?? (await chooseDestination(files.length))
	if (target) send(files, target.id, target.name)
}

async function chooseDestination(count?: number) {
	const chosen = await destinationDialog.open({ folders: tree.value?.folders ?? [], initialId: prefs.value.lastFolderId, count })
	const folder = chosen ? foldersById.value.get(chosen) : undefined
	if (folder) update({ lastFolderId: folder.id })
	return folder
}

function send(files: File[], folderId: string, folderName: string): void {
	uploads.enqueue(files, { folderId, folderName })
	toast.add({
		title: t('dms_media.toasts.uploading', { count: files.length, name: folderName }, files.length),
		icon: 'i-ph-cloud-arrow-up',
		color: 'neutral',
		actions: [{ label: t('dms_media.upload_strip.see_progress'), onClick: () => void navigateDms(MEDIA_ROUTES.uploads) }],
	})
}

async function chooseFiles(): Promise<void> {
	const target = destination.value ?? (await chooseDestination())
	if (!target) return
	fileInput.value?.click()
}

function onFilesChosen(event: Event): void {
	const input = event.target as HTMLInputElement
	const files = Array.from(input.files ?? [])
	if (destination.value) send(files, destination.value.id, destination.value.name)
	input.value = ''
}
</script>

<template>
	<div
		v-if="writable.length"
		class="flex flex-wrap items-center gap-4 rounded-[var(--dms-radius-card)] border border-dashed p-4 transition-colors"
		:class="isDragging ? 'border-(--ui-primary) bg-(--dms-accent-tint)' : 'border-(--ui-border-accented)'"
	>
		<DmsIconWell icon="i-ph-cloud-arrow-up" tone="primary" />
		<div class="min-w-48 flex-1">
			<p class="text-highlighted text-sm font-semibold">
				{{ isDragging && destination ? t('dms_media.upload_strip.drop_now', { name: destination.name }) : t('dms_media.upload_strip.title') }}
			</p>
			<p class="text-muted text-[13px]">
				{{ destination ? t('dms_media.upload_strip.description') : t('dms_media.upload_strip.description_first') }}
			</p>
		</div>
		<UButton
			color="neutral"
			variant="outline"
			icon="i-ph-folder-simple"
			trailing-icon="i-ph-caret-up-down"
			class="max-w-80"
			@click="chooseDestination()"
		>
			<span class="truncate">{{ destination?.name ?? t('dms_media.upload_strip.pick_folder') }}</span>
			<span v-if="parentPath" class="text-dimmed truncate font-mono text-[11px]">{{ parentPath }}</span>
		</UButton>
		<UButton icon="i-ph-upload-simple" color="neutral" variant="outline" :label="t('dms_media.upload_strip.choose')" @click="chooseFiles" />
		<input ref="fileInput" type="file" multiple class="hidden" @change="onFilesChosen" />
	</div>
</template>
