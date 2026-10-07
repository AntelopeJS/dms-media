<script setup lang="ts">
import ColumnsView from './ColumnsView.vue'
import FolderStrip from './FolderStrip.vue'
import GridView from './GridView.vue'
import ListView from './ListView.vue'

const { library, commands } = useExplorerContext()
const { prefs } = useMediaPrefs()
const { t } = useI18n()

const location = computed(() => library.listing.location.value)
const folder = computed(() => library.currentFolder.value)
const assets = computed(() => library.listing.assets.value)
const folders = computed(() => library.visibleFolders.value)
const isFirstLoad = computed(
	() => (library.listing.isLoading.value && assets.value.length === 0) || (library.tree.isLoading.value && !library.tree.tree.value),
)
const isEmpty = computed(
	() => !isFirstLoad.value && assets.value.length === 0 && folders.value.length === 0 && !library.listing.error.value,
)
const SKELETON_TILES = 8

const emptyState = computed(() => {
	const current = location.value
	if (current.kind === 'search')
		return { icon: 'i-ph-magnifying-glass', title: t('dms_media.empty.search_title', { query: current.query }), description: t('dms_media.empty.search_description'), variant: 'no-result' as const }
	if (current.kind === 'view')
		return { icon: 'i-ph-sparkle', title: t(`dms_media.empty.view_${current.view.replace('-', '_')}_title`), description: t(`dms_media.empty.view_${current.view.replace('-', '_')}_description`), variant: 'no-data' as const }
	if (folder.value?.shell)
		return { icon: 'i-ph-lock-simple', title: t('dms_media.empty.shell_title', { name: folder.value.name }), description: t('dms_media.empty.shell_description'), variant: 'no-access' as const }
	if (folder.value)
		return { icon: 'i-ph-cloud-arrow-up', title: t('dms_media.empty.folder_title', { name: folder.value.name }), description: folder.value.rights.write ? t('dms_media.empty.folder_description') : t('dms_media.empty.folder_read_only'), variant: 'no-data' as const }
	return { icon: 'i-ph-images', title: t('dms_media.empty.root_title'), description: t('dms_media.empty.root_description'), variant: 'no-data' as const }
})
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
			v-else-if="library.listing.error.value"
			variant="error"
			:title="t('dms_media.empty.error_title')"
			:description="t('dms_media.empty.error_description')"
			:actions="[{ label: t('dms_media.actions.retry'), icon: 'i-ph-arrow-clockwise', onClick: () => library.listing.load() }]"
		/>
		<template v-else>
			<ColumnsView v-if="prefs.view === 'columns' && location.kind !== 'search' && location.kind !== 'view'" :assets="assets" />
			<template v-else>
				<FolderStrip :folders="folders" />
				<ListView v-if="prefs.view === 'list'" :assets="assets" />
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
							<UButton v-if="folder.rights.manage && !folder.bound" icon="i-ph-folder-plus" color="neutral" variant="outline" :label="t('dms_media.actions.new_folder')" @click="commands.newFolder(folder.id)" />
						</template>
						<UButton
							v-if="folder?.shell && commands.canManagePermissions.value"
							icon="i-ph-shield-check"
							color="neutral"
							variant="outline"
							:label="t('dms_media.empty.see_access')"
							:to="accessLink(folder.id)"
						/>
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
			<p v-if="isEmpty && location.kind === 'folder' && folder?.rights.write" class="text-dimmed text-center font-mono text-[11px]">
				{{ t('dms_media.empty.limits', { size: '500 MB' }) }}
			</p>
		</template>
	</div>
</template>
