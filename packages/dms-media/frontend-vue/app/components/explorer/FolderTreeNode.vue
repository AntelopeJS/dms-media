<script setup lang="ts">
import type { MediaFolder } from '../../types/media'
import FolderGlyph from '../shared/FolderGlyph.vue'
import FolderMarkers from '../shared/FolderMarkers.vue'

const props = defineProps<{
	folder: MediaFolder
	depth: number
	expanded: Set<string>
	activeId?: string
}>()
const emit = defineEmits<{ toggle: [string] }>()
const { library, commands } = useExplorerContext()
const format = useMediaFormat()
const drop = useExplorerDrop()

const children = computed(() => library.tree.childrenOf(props.folder.id))
const isOpen = computed(() => props.expanded.has(props.folder.id))
const isActive = computed(() => props.activeId === props.folder.id)
const isDropTarget = computed(() => drop.hoverFolderId.value === props.folder.id)
const menu = computed(() => commands.folderMenu(props.folder))
</script>

<template>
	<li role="treeitem" :aria-expanded="children.length ? isOpen : undefined" :aria-selected="isActive">
		<UContextMenu :items="menu">
			<div
				class="group flex items-center gap-1 rounded-md pe-2 text-[13px] transition-colors"
				:class="[
					isActive ? 'bg-(--dms-accent-tint) text-highlighted font-medium' : 'text-default hover:bg-(--dms-bg-muted)',
					isDropTarget && 'ring-primary ring-2 ring-inset',
				]"
				:style="{ paddingInlineStart: `${depth * 14 + 4}px` }"
				@dragover="drop.onFolderDragOver($event, folder)"
				@dragleave="drop.onFolderDragLeave(folder)"
				@drop="drop.onFolderDrop($event, folder)"
			>
				<button
					v-if="children.length"
					type="button"
					class="text-dimmed hover:text-highlighted flex size-5 shrink-0 items-center justify-center rounded-sm"
					:aria-label="isOpen ? $t('dms_media.actions.collapse') : $t('dms_media.actions.expand')"
					@click="emit('toggle', folder.id)"
				>
					<UIcon :name="isOpen ? 'i-ph-caret-down' : 'i-ph-caret-right'" class="size-3" />
				</button>
				<span v-else class="w-5 shrink-0" />
				<button
					type="button"
					class="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-start"
					@click="library.openFolder(folder.id)"
				>
					<FolderGlyph :folder="folder" :open="isActive" />
					<span class="truncate" :class="folder.shell && 'text-muted'">{{ folder.name }}</span>
					<FolderMarkers :folder="folder" />
				</button>
				<span v-if="!folder.shell" class="text-dimmed font-mono text-[11px]">
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
				@toggle="emit('toggle', $event)"
			/>
		</ul>
	</li>
</template>
