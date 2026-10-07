<script setup lang="ts">
import type { MediaFolder } from '../../types/media'
import FolderGlyph from '../shared/FolderGlyph.vue'
import FolderMarkers from '../shared/FolderMarkers.vue'

defineProps<{ folders: MediaFolder[] }>()
const { library, commands } = useExplorerContext()
const drop = useExplorerDrop()
const format = useMediaFormat()
const { t } = useI18n()

function isFocused(folder: MediaFolder): boolean {
	return library.selection.focusedFolderId.value === folder.id
}
</script>

<template>
	<section v-if="folders.length" class="flex flex-col gap-2">
		<DmsEyebrow :label="`${t('dms_media.explorer.folders')} · ${folders.length}`" tone="muted" />
		<div class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
			<UContextMenu v-for="folder in folders" :key="folder.id" :items="commands.folderMenu(folder)">
				<div
					class="border-default group flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm transition-colors outline-none"
					:class="[
						isFocused(folder) ? 'bg-(--dms-accent-tint) border-primary' : 'hover:bg-(--dms-bg-muted) focus-visible:ring-primary focus-visible:ring-2',
						drop.hoverFolderId.value === folder.id && 'ring-primary ring-2',
					]"
					role="button"
					tabindex="0"
					@click="library.selection.focusFolder(folder.id)"
					@dblclick="library.openFolder(folder.id)"
					@keydown.enter.prevent="library.openFolder(folder.id)"
					@dragover="drop.onFolderDragOver($event, folder)"
					@dragleave="drop.onFolderDragLeave(folder)"
					@drop="drop.onFolderDrop($event, folder)"
				>
					<FolderGlyph :folder="folder" />
					<span class="text-highlighted min-w-0 flex-1 truncate font-medium">{{ folder.name }}</span>
					<FolderMarkers :folder="folder" />
					<span v-if="!folder.shell" class="text-dimmed font-mono text-[11px]">{{ format.formatNumber(folder.fileCount) }}</span>
					<UDropdownMenu :items="commands.folderMenu(folder)">
						<UButton
							icon="i-ph-dots-three"
							color="neutral"
							variant="ghost"
							size="xs"
							square
							class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
							:aria-label="t('dms_media.actions.more')"
							@click.stop
						/>
					</UDropdownMenu>
				</div>
			</UContextMenu>
		</div>
	</section>
</template>
