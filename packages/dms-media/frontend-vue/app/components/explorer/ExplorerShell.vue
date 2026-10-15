<script setup lang="ts">
import type { ExplorerHistory } from '../../composables/library/useExplorerLayout'
import type { LibraryLocation, ListingFilters } from '../../composables/library/useLibraryListing'
import type { MediaAsset, MediaFolder } from '../../types/media'
import MediaLightbox from '../shared/MediaLightbox.vue'
import BulkBar from './BulkBar.vue'
import ExplorerAnnouncer from './ExplorerAnnouncer.vue'
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
		initialFilters?: Partial<ListingFilters>
		/** Folder a picker is limited to, for a field linked to a folder. */
		scopeFolderId?: string
		/** Files a picker's field already holds. */
		alreadyPicked?: string[]
		/** The browser's history, when the explorer owns the page's URL. */
		history?: ExplorerHistory
	}>(),
	{ mode: 'browse' },
)
const emit = defineEmits<{ location: [LibraryLocation]; filters: [ListingFilters] }>()

const root = useTemplateRef<HTMLElement>('root')
const library = provideMediaLibrary({
	mode: props.mode,
	accept: props.accept,
	remaining: props.remaining,
	scopeFolderId: props.scopeFolderId,
	alreadyPicked: props.alreadyPicked,
})
const layout = createExplorerLayout(root, {
	scopeFolderId: props.scopeFolderId,
	accept: props.accept,
	history: () => props.history,
})
provideExplorerLayout(layout)
const overlay = useOverlay()
const lightbox = overlay.create(MediaLightbox)
const { prefs, update } = useMediaPrefs()
const { t } = useI18n()
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const toolbar = useTemplateRef<InstanceType<typeof ExplorerToolbar>>('toolbar')
const pendingDestination = ref<{ id: string; name: string } | null>(null)
const format = useMediaFormat()

/** Files dropped where they cannot go, waiting for the folder the user picks. */
let droppedFiles: File[] = []

const commands = useExplorerCommands(library, {
	pickFiles: (folderId, folderName) => {
		if (droppedFiles.length) return enqueue(droppedFiles, { id: folderId, name: folderName })
		pendingDestination.value = { id: folderId, name: folderName }
		fileInput.value?.click()
	},
	preview: async (asset) => {
		const shownId = await lightbox.open({
			assets: library.listing.assets.value,
			startId: asset.id,
			canEdit: (entry: MediaAsset) => props.mode === 'browse' && commands.canWriteAsset(entry),
		})
		if (shownId && shownId !== asset.id) library.selection.select(shownId, { extend: false, toggle: false })
	},
})
provideExplorerCommands(commands)
const interactions = createAssetInteractions(library, commands, layout)
provideAssetNavigation(createAssetNavigation(library, interactions.onCheck))
const { uploads, enqueue } = useExplorerUploads(library, { accept: props.accept, pick: interactions.onCheck })
const drop = createExplorerDrop(library, (files, folder: MediaFolder) => enqueue(files, folder))
provideExplorerDrop(drop)
const uploadLimit = computed(() => format.formatBytes(uploads.maxUploadBytes.value))

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
	void chooseDropDestination(files)
}

/** Files dropped outside a folder they can go to ask where to upload them. */
async function chooseDropDestination(files: File[]): Promise<void> {
	droppedFiles = files
	try {
		await commands.upload()
	} finally {
		droppedFiles = []
	}
}

watch(
	() => library.listing.location.value,
	(location) => {
		layout.isSidebarDrawerOpen.value = false
		emit('location', location)
	},
	{ deep: true },
)
watch(
	() => library.listing.filters.value,
	(filters) => emit('filters', filters),
	{ deep: true },
)

function startLocation(): LibraryLocation {
	return props.scopeFolderId ? { kind: 'folder', folderId: props.scopeFolderId } : { kind: 'root' }
}

/** A link to a folder that is gone, or that the user cannot open, lands on the start with a word why. */
function checkedLocation(target: LibraryLocation): LibraryLocation {
	const folderId = target.kind === 'folder' ? target.folderId : target.kind === 'search' ? target.scopeId : undefined
	if (!folderId || library.tree.foldersById.value.has(folderId)) return target
	library.toast.add({
		title: t('dms_media.toasts.folder_missing'),
		description: t('dms_media.toasts.folder_missing_description'),
		color: 'warning',
		icon: 'i-ph-folder-dashed',
	})
	return target.kind === 'search' ? { kind: 'search', query: target.query } : startLocation()
}

/** Shows a location with its filters, as a link or the browser's history gives them. */
async function navigate(target: LibraryLocation, filters: Partial<ListingFilters> = {}): Promise<void> {
	await library.open(checkedLocation(target), false)
	const current = library.listing.filters.value
	const changes = Object.fromEntries(
		Object.entries(filters).filter(([name, value]) => value !== undefined && value !== current[name as keyof ListingFilters]),
	)
	if (Object.keys(changes).length) await library.listing.setFilters(changes)
}

onMounted(async () => {
	await library.tree.ready()
	await navigate(props.initialLocation ?? startLocation(), props.initialFilters)
})

const isBrowse = props.mode === 'browse'
const selected = computed(() => library.selection.selectedAssets.value)
const single = computed(() => library.selection.focusedAsset.value)

function toggleDetails(): void {
	if (layout.hasInlineDetails.value) update({ showDetails: !prefs.value.showDetails })
	else layout.isDetailsDrawerOpen.value = !layout.isDetailsDrawerOpen.value
}

function openParent(): void {
	const folder = library.currentFolder.value
	if (!folder || folder.id === props.scopeFolderId) return
	void library.openFolder(folder.parentId)
}

function onKey(run: () => unknown) {
	return () => void run()
}

definePageShortcuts(
	() => ({
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
		meta_arrowup: onKey(openParent),
		escape: onKey(() => isBrowse && library.selection.clear()),
		'1': onKey(() => update({ view: 'grid' })),
		'2': onKey(() => update({ view: 'list' })),
		'3': onKey(() => update({ view: 'columns' })),
		i: onKey(toggleDetails),
		'shift_?': onKey(() => commands.showShortcuts()),
	}),
	root,
)

defineExpose({
	library,
	navigate,
	upload: () => commands.upload(),
	focusSearch: () => toolbar.value?.focusSearch(),
})
</script>

<template>
	<div
		ref="root"
		class="dms-card relative flex h-full min-h-[560px] flex-col overflow-hidden"
		@dragenter="drop.onShellDragEnter"
		@dragleave="drop.onShellDragLeave"
		@dragover.prevent
		@drop="onContentDrop"
	>
		<ExplorerToolbar ref="toolbar" @toggle-details="toggleDetails" />
		<div class="flex min-h-0 flex-1">
			<ExplorerSidebar v-if="layout.hasInlineSidebar.value" class="border-default w-60 shrink-0 border-e" />
			<main class="flex min-w-0 flex-1 flex-col">
				<BulkBar v-if="isBrowse && selected.length > 1" />
				<ExplorerHeader v-else />
				<div class="min-h-0 flex-1 overflow-y-auto" @click.self="isBrowse && library.selection.clear()">
					<ExplorerContent />
				</div>
			</main>
			<ExplorerInspector v-if="layout.hasInlineDetails.value && prefs.showDetails" class="border-default w-80 shrink-0 border-s" />
		</div>
		<USlideover
			v-if="!layout.hasInlineSidebar.value"
			v-model:open="layout.isSidebarDrawerOpen.value"
			side="left"
			:title="t('dms_media.explorer.sidebar')"
			:ui="{ content: 'max-w-72', body: 'flex p-0 sm:p-0' }"
		>
			<template #body>
				<ExplorerSidebar class="min-w-0 flex-1" />
			</template>
		</USlideover>
		<USlideover
			v-if="!layout.hasInlineDetails.value"
			v-model:open="layout.isDetailsDrawerOpen.value"
			side="right"
			:title="t('dms_media.explorer.details')"
			:ui="{ content: 'max-w-sm', body: 'flex p-0 sm:p-0' }"
		>
			<template #body>
				<ExplorerInspector class="min-w-0 flex-1" />
			</template>
		</USlideover>
		<slot name="footer">
			<ExplorerStatusBar />
		</slot>
		<ExplorerAnnouncer />
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
			<p class="text-dimmed font-mono text-xs">{{ t('dms_media.drop.limit', { size: uploadLimit }) }}</p>
		</div>
	</div>
</template>
