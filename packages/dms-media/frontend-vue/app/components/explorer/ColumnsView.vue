<script setup lang="ts">
import type { MediaAsset, MediaFolder } from '../../types/media'
import AssetThumb from '../shared/AssetThumb.vue'
import FolderGlyph from '../shared/FolderGlyph.vue'
import FolderMarkers from '../shared/FolderMarkers.vue'

const props = defineProps<{ assets: MediaAsset[] }>()
const { library, commands } = useExplorerContext()
const interactions = useAssetInteractions()
const navigation = useAssetNavigation()
const layout = useExplorerLayout()
const drop = useExplorerDrop()
const format = useMediaFormat()
const { t } = useI18n()

interface FolderColumn {
	key: string
	folders: MediaFolder[]
	activeId?: string
	/** The open folder's column: its subfolders, then its files, as in Finder. */
	isCurrent: boolean
}

const chain = computed(() => {
	const ancestors = folderAncestors(library.currentFolder.value, library.tree.foldersById.value)
	const scopeIndex = ancestors.findIndex((folder) => folder.id === layout.scopeFolderId)
	return scopeIndex < 0 ? ancestors : ancestors.slice(scopeIndex)
})

const columns = computed<FolderColumn[]>(() => {
	const startId = layout.scopeFolderId && chain.value.length ? chain.value[0]!.id : null
	const parents: Array<string | null> = startId ? chain.value.map((folder) => folder.id) : [null, ...chain.value.map((folder) => folder.id)]
	const offset = startId ? 1 : 0
	return parents.map((parentId, index) => ({
		key: parentId ?? 'root',
		folders: library.tree.childrenOf(parentId),
		activeId: chain.value[index + offset]?.id,
		isCurrent: index === parents.length - 1,
	}))
})

const showFiles = computed(() => library.listing.location.value.kind !== 'root')
const scroller = useTemplateRef<HTMLElement>('scroller')

watch(
	() => columns.value.length,
	async () => {
		await nextTick()
		scroller.value?.scrollTo({ left: scroller.value.scrollWidth, behavior: 'smooth' })
	},
)
</script>

<template>
	<div ref="scroller" class="border-default flex h-full min-h-80 overflow-x-auto rounded-md border">
		<div
			v-for="column in columns"
			:key="column.key"
			class="border-default flex shrink-0 flex-col overflow-y-auto border-e p-1 last:border-e-0"
			:class="column.isCurrent && showFiles ? 'w-72' : 'w-60'"
		>
			<ul :aria-label="t('dms_media.explorer.folders')">
				<li v-for="folder in column.folders" :key="folder.id">
					<UContextMenu :items="commands.folderMenu(folder)">
						<button
							type="button"
							class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-(--ui-primary) focus-visible:ring-inset"
							:class="[
								column.activeId === folder.id ? 'bg-(--dms-accent-tint) text-highlighted font-medium' : 'hover:bg-(--dms-bg-muted)',
								drop.hoverFolderId.value === folder.id && 'ring-primary ring-2',
							]"
							:aria-current="column.activeId === folder.id ? 'location' : undefined"
							:draggable="drop.canDragFolder(folder)"
							@click="library.openFolder(folder.id)"
							@dragstart="drop.startFolderDrag($event, folder)"
							@dragend="drop.endAssetDrag()"
							@dragover="drop.onFolderDragOver($event, folder)"
							@dragleave="drop.onFolderDragLeave(folder)"
							@drop="drop.onFolderDrop($event, folder)"
						>
							<FolderGlyph :folder="folder" :open="column.activeId === folder.id" />
							<span class="min-w-0 flex-1 truncate">{{ folder.name }}</span>
							<FolderMarkers :folder="folder" />
							<span v-if="!folder.shell" class="text-dimmed font-mono text-xs">{{ format.formatNumber(folder.fileCount) }}</span>
							<UIcon name="i-ph-caret-right" class="text-dimmed size-3" />
						</button>
					</UContextMenu>
				</li>
			</ul>
			<ul
				v-if="column.isCurrent && showFiles"
				role="listbox"
				:aria-multiselectable="library.remaining !== 1"
				:aria-label="t('dms_media.explorer.files')"
				:class="column.folders.length && props.assets.length ? 'border-default mt-1 border-t pt-1' : undefined"
				@keydown="navigation.onKeydown"
			>
				<li v-for="asset in props.assets" :key="asset.id" role="none">
					<UContextMenu :items="commands.fileMenu(asset)">
						<div
							class="flex items-center gap-2 rounded-sm px-2 py-1 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-(--ui-primary) focus-visible:ring-inset"
							:class="[
								interactions.isSelected(asset) ? 'bg-(--dms-accent-tint) text-highlighted' : 'hover:bg-(--dms-bg-muted)',
								interactions.isDisabled(asset) && 'opacity-60',
							]"
							:tabindex="navigation.tabIndexOf(asset)"
							role="option"
							:aria-label="interactions.describe(asset)"
							:aria-selected="interactions.isSelected(asset)"
							:aria-disabled="interactions.isDisabled(asset)"
							:draggable="library.mode === 'browse'"
							:data-asset-id="asset.id"
							@focus="navigation.onFocus(asset)"
							@click="interactions.onClick($event, asset)"
							@dblclick="interactions.onOpen(asset)"
							@contextmenu="interactions.onContextMenu(asset)"
							@keydown.enter.prevent="interactions.onOpen(asset)"
							@dragstart="drop.startAssetDrag($event, asset)"
							@dragend="drop.endAssetDrag()"
						>
							<AssetThumb :asset="asset" size="xs" />
							<span class="min-w-0 flex-1">
								<span class="block truncate">{{ asset.name }}</span>
								<span v-if="interactions.disabledReason(asset)" class="text-muted block truncate text-xs">{{ interactions.disabledReason(asset) }}</span>
							</span>
							<UIcon v-if="needsAltText(asset)" name="i-ph-text-aa" class="text-warning size-3.5" />
						</div>
					</UContextMenu>
				</li>
				<li v-if="props.assets.length === 0 && column.folders.length === 0" role="none" class="text-muted px-2 py-3 text-[13px]">
					{{ t('dms_media.explorer.no_files_here') }}
				</li>
			</ul>
		</div>
	</div>
</template>
