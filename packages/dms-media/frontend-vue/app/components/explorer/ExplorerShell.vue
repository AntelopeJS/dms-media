<script setup lang="ts">
import type { LibraryLocation } from '../../composables/library/useLibraryListing'
import type { MediaAsset, MediaFolder } from '../../types/media'
import MediaLightbox from '../shared/MediaLightbox.vue'
import BulkBar from './BulkBar.vue'
import ExplorerContent from './ExplorerContent.vue'
import ExplorerHeader from './ExplorerHeader.vue'
import ExplorerInspector from './ExplorerInspector.vue'
import ExplorerSidebar from './ExplorerSidebar.vue'
import ExplorerStatusBar from './ExplorerStatusBar.vue'
import ExplorerToolbar from './ExplorerToolbar.vue'

const props = withDefaults(
	defineProps<{
		mode?: 'browse' | 'pick'
		accept?: string[]
		remaining?: number
		initialLocation?: LibraryLocation
	}>(),
	{ mode: 'browse' },
)
const emit = defineEmits<{ location: [LibraryLocation] }>()

const library = provideMediaLibrary({ mode: props.mode, accept: props.accept, remaining: props.remaining })
const overlay = useOverlay()
const lightbox = overlay.create(MediaLightbox)
const uploads = useUploadQueue()
const { prefs, update } = useMediaPrefs()
const { t } = useI18n()
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const toolbar = useTemplateRef<InstanceType<typeof ExplorerToolbar>>('toolbar')
const pendingDestination = ref<{ id: string; name: string } | null>(null)

function enqueue(files: File[], folder: { id: string; name: string }): void {
	if (files.length === 0) return
	update({ lastFolderId: folder.id })
	uploads.enqueue(files, { folderId: folder.id, folderName: folder.name })
	library.toast.add({
		title: t('dms_media.toasts.uploading', { count: files.length, name: folder.name }, files.length),
		icon: 'i-ph-cloud-arrow-up',
		color: 'neutral',
	})
}

const commands = useExplorerCommands(library, {
	pickFiles: (folderId, folderName) => {
		pendingDestination.value = { id: folderId, name: folderName }
		fileInput.value?.click()
	},
	preview: (asset) => {
		void lightbox.open({
			assets: library.listing.assets.value,
			startId: asset.id,
			canEdit: (entry: MediaAsset) => props.mode === 'browse' && commands.canWriteAsset(entry),
		})
	},
})
provideExplorerCommands(commands)
const drop = createExplorerDrop(library, (files, folder: MediaFolder) => enqueue(files, folder))
provideExplorerDrop(drop)

function onFilesChosen(event: Event): void {
	const input = event.target as HTMLInputElement
	const files = Array.from(input.files ?? [])
	if (pendingDestination.value) enqueue(files, pendingDestination.value)
	input.value = ''
	pendingDestination.value = null
}

function onContentDrop(event: DragEvent): void {
	drop.resetFileDrag()
	const files = Array.from(event.dataTransfer?.files ?? [])
	if (files.length === 0) return
	event.preventDefault()
	const folder = library.currentFolder.value
	if (folder?.rights.write) return enqueue(files, folder)
	library.toast.add({ title: t('dms_media.toasts.drop_needs_folder'), color: 'warning', icon: 'i-ph-folder-simple' })
}

const stopListening = uploads.onUploaded((asset) => {
	library.tree.adjustCounts(asset.folderId, 1, asset.size)
	const current = library.listing.location.value
	if (current.kind === 'folder' && current.folderId === asset.folderId) library.listing.insertAsset(asset)
})
onBeforeUnmount(stopListening)

watch(
	() => library.listing.location.value,
	(location) => emit('location', location),
	{ deep: true },
)

onMounted(async () => {
	await library.tree.refresh()
	if (library.tree.tree.value) uploads.maxUploadBytes.value = library.tree.tree.value.maxUploadBytes
	const start = props.initialLocation
	const isKnownFolder = start?.kind !== 'folder' || library.tree.foldersById.value.has(start.folderId)
	await library.open(start && isKnownFolder ? start : { kind: 'root' }, false)
})

const isBrowse = props.mode === 'browse'
const selected = computed(() => library.selection.selectedAssets.value)
const single = computed(() => library.selection.focusedAsset.value)

function onKey(run: () => unknown) {
	return () => void run()
}

defineShortcuts({
	u: onKey(() => isBrowse && commands.upload()),
	shift_n: onKey(() => isBrowse && commands.newFolder()),
	' ': onKey(() => single.value && commands.preview(single.value)),
	enter: onKey(() => single.value && commands.openDetails(single.value)),
	e: onKey(() => single.value && commands.edit(single.value)),
	f2: onKey(() => isBrowse && single.value && commands.renameAsset(single.value)),
	m: onKey(() => isBrowse && selected.value.length && commands.moveAssets(selected.value)),
	delete: onKey(() => isBrowse && selected.value.length && commands.deleteAssets(selected.value)),
	backspace: onKey(() => isBrowse && selected.value.length && commands.deleteAssets(selected.value)),
	meta_a: onKey(() => isBrowse && library.selection.selectAll()),
	escape: onKey(() => library.selection.clear()),
	'1': onKey(() => update({ view: 'grid' })),
	'2': onKey(() => update({ view: 'list' })),
	'3': onKey(() => update({ view: 'columns' })),
	i: onKey(() => update({ showDetails: !prefs.value.showDetails })),
	'shift_?': onKey(() => commands.showShortcuts()),
})

defineExpose({ library, focusSearch: () => toolbar.value?.focusSearch() })
</script>

<template>
	<div
		class="dms-card relative flex h-full min-h-[560px] flex-col overflow-hidden"
		@dragenter="drop.onShellDragEnter"
		@dragleave="drop.onShellDragLeave"
		@dragover.prevent
		@drop="onContentDrop"
	>
		<ExplorerToolbar ref="toolbar" />
		<div class="flex min-h-0 flex-1">
			<ExplorerSidebar class="border-default w-60 shrink-0 border-e max-md:hidden" />
			<main class="flex min-w-0 flex-1 flex-col">
				<BulkBar v-if="isBrowse && selected.length > 1" />
				<ExplorerHeader v-else />
				<div class="min-h-0 flex-1 overflow-y-auto" @click.self="library.selection.clear()">
					<ExplorerContent />
				</div>
			</main>
			<ExplorerInspector v-if="prefs.showDetails" class="border-default w-80 shrink-0 border-s max-lg:hidden" />
		</div>
		<slot name="footer">
			<ExplorerStatusBar />
		</slot>
		<input ref="fileInput" type="file" multiple class="hidden" :accept="accept?.join(',')" @change="onFilesChosen" />
		<div
			v-if="drop.isDraggingFiles.value && !drop.hoverFolderId.value"
			class="pointer-events-none absolute inset-3 z-20 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-(--ui-primary) bg-(--dms-surface-card)/85 backdrop-blur-sm"
		>
			<DmsIconWell icon="i-ph-cloud-arrow-up" tone="primary" size="lg" />
			<p class="text-highlighted text-base font-semibold">
				{{
					library.currentFolder.value?.rights.write
						? t('dms_media.drop.title', { count: drop.fileCount.value, name: library.currentFolder.value.name }, drop.fileCount.value)
						: t('dms_media.drop.pick_folder')
				}}
			</p>
			<p v-if="library.currentFolder.value?.rights.write" class="text-muted text-sm">
				{{ folderPathLabel(library.currentFolder.value, library.tree.foldersById.value) }} ·
				{{ t(`dms_media.visibility.${library.currentFolder.value.visibility}`) }}
			</p>
			<p class="text-dimmed font-mono text-[11px]">{{ t('dms_media.drop.limit', { size: '500 MB' }) }}</p>
		</div>
	</div>
</template>
