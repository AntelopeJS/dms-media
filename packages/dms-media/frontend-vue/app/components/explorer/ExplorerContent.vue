<script setup lang="ts">
import { effectiveViewOf } from '../../composables/library/useExplorerLayout'
import type { ListingFilters } from '../../composables/library/useLibraryListing'
import ColumnsView from './ColumnsView.vue'
import FolderStrip from './FolderStrip.vue'
import GridView from './GridView.vue'
import ListView from './ListView.vue'

const { library, commands } = useExplorerContext()
const layout = useExplorerLayout()
const uploads = useUploadQueue()
const format = useMediaFormat()
const { prefs } = useMediaPrefs()
const { t } = useI18n()
const SKELETON_TILES = 8

const NO_NARROWING: Partial<ListingFilters> = { type: undefined, visibility: 'any', modified: 'any', orientation: 'any' }

const location = computed(() => library.listing.location.value)
const folder = computed(() => library.currentFolder.value)
const assets = computed(() => library.listing.assets.value)
const folders = computed(() => library.visibleFolders.value)
const view = computed(() => effectiveViewOf(prefs.value.view, location.value))
const isTreePending = computed(() => !library.tree.tree.value && !library.tree.error.value)
const isFirstLoad = computed(
	() => isTreePending.value || (library.listing.isLoading.value && assets.value.length === 0),
)
const isShell = computed(() => Boolean(folder.value?.shell))
const error = computed(() => (isShell.value ? null : library.listing.error.value))
const hasNoFiles = computed(
	() => !isFirstLoad.value && !isShell.value && assets.value.length === 0 && library.listing.total.value === 0 && !error.value,
)
/** Filters narrow the files, so an empty result says so rather than "this folder is empty". */
const isNarrowed = computed(() => {
	const filters = library.listing.filters.value
	return Object.entries(NO_NARROWING).some(([name, idle]) => filters[name as keyof ListingFilters] !== idle)
})
const isFilteredOut = computed(() => hasNoFiles.value && isNarrowed.value && (location.value.kind === 'folder' || location.value.kind === 'view'))
const filteredPlace = computed(() => {
	const current = location.value
	return current.kind === 'view' ? t(`dms_media.smart_views.${current.view}`) : (folder.value?.name ?? '')
})
const isEmpty = computed(() => hasNoFiles.value && !isNarrowed.value && folders.value.length === 0)
const isMissing = computed(() => isOutOfReachError(error.value))
const acceptedTypes = computed(() => fieldTypesLabel(layout.accept, t))
const limits = computed(() => {
	const size = format.formatBytes(uploads.maxUploadBytes.value)
	if (library.mode === 'pick' && acceptedTypes.value) return t('dms_media.empty.limits_accept', { types: acceptedTypes.value, size })
	return t('dms_media.empty.limits', { size })
})

/** A page emptied by a move or a delete brings in the files that were waiting behind it. */
watch(
	() => assets.value.length,
	(count, before) => {
		if (count === 0 && before > 0 && library.listing.hasMore.value && !library.listing.isLoading.value)
			void library.listing.load(true)
	},
)

/** Where an empty search looked: the folder it was bound to, or every folder the caller can open. */
const searchDescription = computed(() => {
	const current = location.value
	const scopeId = current.kind === 'search' ? (current.scopeId ?? library.listing.scopeFolderId.value) : undefined
	const scope = scopeId ? library.tree.foldersById.value.get(scopeId)?.name : undefined
	return scope ? t('dms_media.empty.search_description_in', { scope }) : t('dms_media.empty.search_description')
})

const emptyState = computed(() => {
	const current = location.value
	if (current.kind === 'search')
		return { icon: 'i-ph-magnifying-glass', title: t('dms_media.empty.search_title', { query: current.query }), description: searchDescription.value, variant: 'no-result' as const }
	if (current.kind === 'view')
		return { icon: 'i-ph-sparkle', title: t(`dms_media.empty.view_${current.view.replace('-', '_')}_title`), description: t(`dms_media.empty.view_${current.view.replace('-', '_')}_description`), variant: 'no-data' as const }
	if (folder.value)
		return { icon: 'i-ph-cloud-arrow-up', title: t('dms_media.empty.folder_title', { name: folder.value.name }), description: folder.value.rights.write ? t('dms_media.empty.folder_description') : t('dms_media.empty.folder_read_only'), variant: 'no-data' as const }
	return { icon: 'i-ph-images', title: t('dms_media.empty.root_title'), description: t('dms_media.empty.root_description'), variant: 'no-data' as const }
})

function clearFilters(): void {
	void library.listing.setFilters(NO_NARROWING)
}

function openStart(): void {
	void library.openFolder(layout.scopeFolderId ?? null)
}
</script>

<template>
	<div class="flex min-h-full flex-col gap-5 p-4">
		<div v-if="isFirstLoad" class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3" aria-busy="true">
			<div v-for="index in SKELETON_TILES" :key="index" class="flex flex-col gap-2">
				<USkeleton class="aspect-square w-full rounded-md" />
				<USkeleton class="h-3 w-3/4" />
				<USkeleton class="h-3 w-1/3" />
			</div>
		</div>
		<DmsEmptyState
			v-else-if="error && isMissing"
			variant="no-access"
			icon="i-ph-folder-dashed"
			:title="t('dms_media.toasts.folder_missing')"
			:description="t('dms_media.toasts.folder_missing_description')"
			:actions="[{ label: t('dms_media.empty.go_to_start'), icon: 'i-ph-house', onClick: openStart }]"
		/>
		<DmsEmptyState
			v-else-if="error"
			variant="error"
			:title="t('dms_media.empty.error_title')"
			:description="t('dms_media.empty.error_description')"
			:actions="[{ label: t('dms_media.actions.retry'), icon: 'i-ph-arrow-clockwise', onClick: () => library.listing.load() }]"
		/>
		<template v-else>
			<UAlert
				v-if="isShell && folder"
				icon="i-ph-lock-simple"
				color="neutral"
				variant="subtle"
				:title="t('dms_media.empty.shell_title', { name: folder.name })"
				:description="t('dms_media.empty.shell_description')"
			/>
			<ColumnsView v-if="view === 'columns'" :assets="assets" />
			<template v-else>
				<FolderStrip :folders="folders" />
				<ListView v-if="view === 'list'" :assets="assets" />
				<GridView v-else :assets="assets" />
			</template>
			<div v-if="library.listing.hasMore.value" class="flex justify-center">
				<UButton
					color="neutral"
					variant="outline"
					:loading="library.listing.isLoading.value"
					:label="t('dms_media.explorer.load_more', { count: library.listing.total.value - assets.length })"
					@click="library.listing.load(true)"
				/>
			</div>
			<DmsEmptyState
				v-if="isFilteredOut"
				variant="no-result"
				icon="i-ph-funnel-x"
				:title="t('dms_media.empty.filters_title')"
				:description="t('dms_media.empty.filters_description', { name: filteredPlace })"
				:actions="[{ label: t('dms_media.filters.clear'), icon: 'i-ph-x', onClick: clearFilters }]"
			/>
			<DmsEmptyState
				v-if="isEmpty"
				:variant="emptyState.variant"
				:icon="emptyState.icon"
				:title="emptyState.title"
				:description="emptyState.description"
				hatched
			>
				<template #actions>
					<div class="flex flex-wrap justify-center gap-2">
						<template v-if="location.kind === 'folder' && folder?.rights.write && library.mode === 'browse'">
							<UButton icon="i-ph-upload-simple" :label="t('dms_media.actions.upload_files')" @click="commands.upload(folder.id)" />
							<UButton v-if="folder.rights.manage && folder.acceptsSubfolders" icon="i-ph-folder-plus" color="neutral" variant="outline" :label="t('dms_media.actions.new_folder')" @click="commands.newFolder(folder.id)" />
						</template>
						<UButton
							v-if="location.kind === 'search'"
							icon="i-ph-x"
							color="neutral"
							variant="outline"
							:label="t('dms_media.search.clear')"
							@click="library.clearSearch()"
						/>
					</div>
				</template>
			</DmsEmptyState>
			<p v-if="isEmpty && location.kind === 'folder' && folder?.rights.write" class="text-dimmed text-center font-mono text-xs">
				{{ limits }}
			</p>
		</template>
	</div>
</template>
