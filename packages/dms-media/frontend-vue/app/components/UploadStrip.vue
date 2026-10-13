<script setup lang="ts">
import DestinationDialog from './dialogs/DestinationDialog.vue'
import type { MediaFolder } from '../types/media'

const uploads = useUploadQueue()
const overlay = useOverlay()
const destinationDialog = overlay.create(DestinationDialog)
const { prefs, update } = useMediaPrefs()
const { tree, reload } = useSharedTree()
const { t } = useI18n()
const toast = useUploadToasts()
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
const acceptAttribute = computed(() => fileAcceptAttribute(destination.value?.accepts ?? tree.value?.allowedMimetypes))
const doneInQueue = computed(() => runningUploadProgress(uploads.items.value).done)
const lostFolder = ref<string | null>(null)

watch(foldersById, (byId, previous) => {
	const id = prefs.value.lastFolderId
	if (!id || byId.has(id) || !previous?.has(id)) return
	lostFolder.value = previous.get(id)?.name ?? null
	update({ lastFolderId: null })
})

onMounted(() => {
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
	await reload()
	const target = destination.value ?? (await chooseDestination('upload', files.length))
	if (target) send(files, target)
}

async function chooseDestination(mode: 'upload' | 'pick', count?: number): Promise<MediaFolder | undefined> {
	const chosen = await destinationDialog.open({
		folders: tree.value?.folders ?? [],
		initialId: prefs.value.lastFolderId,
		count,
		mode,
	})
	if (!chosen) return undefined
	if (!foldersById.value.has(chosen)) await reload()
	const folder = foldersById.value.get(chosen)
	if (folder) {
		lostFolder.value = null
		update({ lastFolderId: folder.id })
	}
	return folder
}

function send(files: File[], folder: MediaFolder): void {
	const batchId = uploads.enqueue(files, { folderId: folder.id, folderName: folder.name, accepts: folder.accepts })
	toast.announce(batchId, files.length, folder.name)
}

async function chooseFiles(): Promise<void> {
	await reload()
	const target = destination.value ?? (await chooseDestination('upload'))
	if (!target) return
	await nextTick()
	fileInput.value?.click()
}

function onFilesChosen(event: Event): void {
	const input = event.target as HTMLInputElement
	const files = Array.from(input.files ?? [])
	if (destination.value && files.length) send(files, destination.value)
	input.value = ''
}
</script>

<template>
	<div
		v-if="writable.length"
		class="flex flex-col gap-3 rounded-[var(--dms-radius-card)] border border-dashed p-4 transition-colors"
		:class="isDragging ? 'border-(--ui-primary) bg-(--dms-accent-tint)' : 'border-(--ui-border-accented)'"
	>
		<div class="flex flex-wrap items-center gap-4">
			<DmsIconWell icon="i-ph-cloud-arrow-up" tone="primary" />
			<div class="min-w-48 flex-1">
				<p class="text-highlighted text-sm font-semibold">
					<template v-if="isDragging && destination">{{ t('dms_media.upload_strip.drop_now', { name: destination.name }) }}</template>
					<template v-else>
						<span class="max-sm:hidden pointer-coarse:hidden">{{ t('dms_media.upload_strip.title') }}</span>
						<span class="hidden max-sm:inline pointer-coarse:inline">{{ t('dms_media.upload_strip.title_tap') }}</span>
					</template>
				</p>
				<p class="text-muted text-[13px]">
					<template v-if="lostFolder">{{ t('dms_media.upload_strip.folder_gone', { name: lostFolder }) }}</template>
					<template v-else-if="destination">
						<span class="max-sm:hidden pointer-coarse:hidden">{{ t('dms_media.upload_strip.description') }}</span>
						<span class="hidden max-sm:inline pointer-coarse:inline">{{ t('dms_media.upload_strip.description_tap') }}</span>
					</template>
					<template v-else>{{ t('dms_media.upload_strip.description_first') }}</template>
				</p>
			</div>
			<UButton
				color="neutral"
				variant="outline"
				icon="i-ph-folder-simple"
				trailing-icon="i-ph-caret-up-down"
				class="max-w-80"
				@click="chooseDestination('pick')"
			>
				<span class="truncate">{{ destination?.name ?? t('dms_media.upload_strip.pick_folder') }}</span>
				<span v-if="parentPath" class="text-dimmed truncate font-mono text-[11px]">{{ parentPath }}</span>
			</UButton>
			<UButton icon="i-ph-upload-simple" color="neutral" variant="outline" :label="t('dms_media.upload_strip.choose')" @click="chooseFiles" />
			<input ref="fileInput" type="file" multiple class="hidden" :accept="acceptAttribute || undefined" @change="onFilesChosen" />
		</div>
		<div v-if="uploads.activeCount.value" class="border-default flex flex-wrap items-center gap-3 border-t pt-3 text-[13px]" role="status">
			<UIcon name="i-ph-circle-notch" class="text-primary size-4 animate-spin" />
			<span class="text-default">
				{{ t('dms_media.upload_strip.in_progress', { count: uploads.activeCount.value, done: doneInQueue }, uploads.activeCount.value) }}
			</span>
			<UButton variant="link" size="xs" trailing-icon="i-ph-arrow-right" :label="t('dms_media.upload_strip.see_progress')" :to="MEDIA_ROUTES.uploads" />
		</div>
	</div>
</template>
