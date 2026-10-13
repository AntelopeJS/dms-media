<script setup lang="ts">
import type { MediaFolder } from '../../types/media'
import FolderGlyph from '../shared/FolderGlyph.vue'
import FolderMarkers from '../shared/FolderMarkers.vue'

const props = defineProps<{
	folder: MediaFolder
	depth: number
	expanded: Set<string>
	activeId?: string
	/** The one tree item Tab lands on. */
	tabStopId?: string
}>()
const emit = defineEmits<{ toggle: [string] }>()
const { library, commands } = useExplorerContext()
const format = useMediaFormat()
const drop = useExplorerDrop()
const { t } = useI18n()

const children = computed(() => library.tree.childrenOf(props.folder.id))
const isOpen = computed(() => props.expanded.has(props.folder.id))
const isActive = computed(() => props.activeId === props.folder.id)
const isDropTarget = computed(() => drop.hoverFolderId.value === props.folder.id)
const menu = computed(() => commands.folderMenu(props.folder))
const countLabel = computed(() =>
	t('dms_media.explorer.count_with_subfolders', { count: format.formatNumber(props.folder.fileCount) }, props.folder.fileCount),
)
</script>

<template>
	<li
		role="treeitem"
		class="rounded-md outline-none [&:focus-visible>div]:ring-2 [&:focus-visible>div]:ring-(--ui-primary) [&:focus-visible>div]:ring-inset"
		:aria-expanded="children.length ? isOpen : undefined"
		:aria-selected="isActive"
		:aria-level="depth"
		:aria-label="folder.name"
		:tabindex="tabStopId === folder.id ? 0 : -1"
		:data-tree-id="folder.id"
	>
		<UContextMenu :items="menu">
			<div
				class="group flex cursor-pointer items-center gap-1 rounded-md pe-2 text-[13px] transition-colors"
				:class="[
					isActive ? 'bg-(--dms-accent-tint) text-highlighted font-medium' : 'text-default hover:bg-(--dms-bg-muted)',
					isDropTarget && 'ring-primary ring-2 ring-inset',
				]"
				:style="{ paddingInlineStart: `${depth * 14 + 4}px` }"
				:draggable="drop.canDragFolder(folder)"
				@click="library.openFolder(folder.id)"
				@dragstart="drop.startFolderDrag($event, folder)"
				@dragend="drop.endAssetDrag()"
				@dragover="drop.onFolderDragOver($event, folder)"
				@dragleave="drop.onFolderDragLeave(folder)"
				@drop="drop.onFolderDrop($event, folder)"
			>
				<span
					v-if="children.length"
					class="text-dimmed hover:text-highlighted flex size-5 shrink-0 items-center justify-center rounded-sm"
					aria-hidden="true"
					@click.stop="emit('toggle', folder.id)"
				>
					<UIcon :name="isOpen ? 'i-ph-caret-down' : 'i-ph-caret-right'" class="size-3" />
				</span>
				<span v-else class="w-5 shrink-0" />
				<span class="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-start">
					<FolderGlyph :folder="folder" :open="isActive" />
					<span class="truncate" :class="folder.shell && 'text-muted'">{{ folder.name }}</span>
					<FolderMarkers :folder="folder" />
				</span>
				<span v-if="!folder.shell" class="text-dimmed font-mono text-xs" :title="countLabel">
					{{ format.formatNumber(folder.fileCount) }}
				</span>
			</div>
		</UContextMenu>
		<ul v-if="isOpen && children.length" role="group">
			<FolderTreeNode
				v-for="child in children"
				:key="child.id"
				:folder="child"
				:depth="depth + 1"
				:expanded="expanded"
				:active-id="activeId"
				:tab-stop-id="tabStopId"
				@toggle="emit('toggle', $event)"
			/>
		</ul>
	</li>
</template>
