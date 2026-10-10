<script setup lang="ts">
import type { MediaAsset, MediaFolder } from '../../types/media'
import AssetThumb from '../shared/AssetThumb.vue'
import FolderGlyph from '../shared/FolderGlyph.vue'
import FolderMarkers from '../shared/FolderMarkers.vue'

const props = defineProps<{ assets: MediaAsset[] }>()
const { library, commands } = useExplorerContext()
const interactions = useAssetInteractions()
const drop = useExplorerDrop()
const { t } = useI18n()

interface FolderColumn {
	key: string
	folders: MediaFolder[]
	activeId?: string
}

const chain = computed(() => folderAncestors(library.currentFolder.value, library.tree.foldersById.value))

const columns = computed<FolderColumn[]>(() => {
	const parents: Array<string | null> = [null, ...chain.value.map((folder) => folder.id)]
	return parents.map((parentId, index) => ({
		key: parentId ?? 'root',
		folders: library.tree.childrenOf(parentId),
		activeId: chain.value[index]?.id,
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
		<ul
			v-for="column in columns"
			:key="column.key"
			class="border-default w-60 shrink-0 overflow-y-auto border-e p-1"
			role="listbox"
		>
			<li v-for="folder in column.folders" :key="folder.id">
				<UContextMenu :items="commands.folderMenu(folder)">
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-[13px]"
						:class="[
							column.activeId === folder.id ? 'bg-(--dms-accent-tint) text-highlighted font-medium' : 'hover:bg-(--dms-bg-muted)',
							drop.hoverFolderId.value === folder.id && 'ring-primary ring-2',
						]"
						@click="library.openFolder(folder.id)"
						@dragover="drop.onFolderDragOver($event, folder)"
						@dragleave="drop.onFolderDragLeave(folder)"
						@drop="drop.onFolderDrop($event, folder)"
					>
						<FolderGlyph :folder="folder" :open="column.activeId === folder.id" />
						<span class="min-w-0 flex-1 truncate">{{ folder.name }}</span>
						<FolderMarkers :folder="folder" />
						<UIcon name="i-ph-caret-right" class="text-dimmed size-3" />
					</button>
				</UContextMenu>
			</li>
		</ul>
		<ul v-if="showFiles" class="w-72 shrink-0 overflow-y-auto p-1" role="listbox" aria-multiselectable="true">
			<li v-for="asset in props.assets" :key="asset.id">
				<UContextMenu :items="commands.fileMenu(asset)">
					<div
						class="flex items-center gap-2 rounded-sm px-2 py-1 text-[13px] outline-none"
						:class="[
							interactions.isSelected(asset) ? 'bg-(--dms-accent-tint) text-highlighted' : 'hover:bg-(--dms-bg-muted)',
							interactions.isDisabled(asset) && 'opacity-40',
						]"
						tabindex="0"
						role="option"
						:aria-selected="interactions.isSelected(asset)"
						:draggable="library.mode === 'browse'"
						@click="interactions.onClick($event, asset)"
						@dblclick="interactions.onOpen(asset)"
						@keydown.enter.prevent="interactions.onOpen(asset)"
						@dragstart="drop.startAssetDrag($event, asset)"
						@dragend="drop.endAssetDrag()"
					>
						<AssetThumb :asset="asset" size="xs" />
						<span class="min-w-0 flex-1 truncate">{{ asset.name }}</span>
						<UIcon v-if="needsAltText(asset)" name="i-ph-text-aa" class="text-warning size-3.5" />
					</div>
				</UContextMenu>
			</li>
			<li v-if="props.assets.length === 0" class="text-muted px-2 py-3 text-[13px]">
				{{ t('dms_media.explorer.no_files_here') }}
			</li>
		</ul>
	</div>
</template>
