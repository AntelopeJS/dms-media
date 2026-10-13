<script setup lang="ts">
import type { MediaFolder } from '../../types/media'
import FolderGlyph from '../shared/FolderGlyph.vue'
import FolderMarkers from '../shared/FolderMarkers.vue'

const props = defineProps<{ folders: MediaFolder[] }>()
const { library, commands } = useExplorerContext()
const layout = useExplorerLayout()
const drop = useExplorerDrop()
const format = useMediaFormat()
const { t } = useI18n()
const focusedIndex = ref(0)
const CARD_SELECTOR = '[data-folder-card]'

/** In the picker or on a touch screen, one tap opens a folder: selecting one serves nothing there. */
const opensOnClick = computed(() => library.mode === 'pick' || layout.opensOnTap.value)

function isFocused(folder: MediaFolder): boolean {
	return library.selection.focusedFolderId.value === folder.id
}

function onClick(folder: MediaFolder): void {
	if (opensOnClick.value) return void library.openFolder(folder.id)
	library.selection.focusFolder(folder.id)
}

function tabIndexOf(index: number): 0 | -1 {
	return index === Math.min(focusedIndex.value, props.folders.length - 1) ? 0 : -1
}

function onKeydown(event: KeyboardEvent): void {
	if (!isGridKey(event.key) || event.altKey || event.metaKey || event.ctrlKey) return
	const cards = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(CARD_SELECTOR))
	const current = cards.findIndex((card) => card === document.activeElement)
	const next = gridIndexAfter(event.key, current, cards.length, gridColumnsOf(cards))
	event.preventDefault()
	if (next === undefined) return
	focusedIndex.value = next
	focusInView(cards[next])
}
</script>

<template>
	<section v-if="folders.length" class="flex flex-col gap-2">
		<DmsEyebrow :label="`${t('dms_media.explorer.folders')} · ${folders.length}`" tone="muted" />
		<div class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2" role="list" :aria-label="t('dms_media.explorer.folders')" @keydown="onKeydown">
			<UContextMenu v-for="(folder, index) in folders" :key="folder.id" :items="commands.folderMenu(folder)">
				<div
					class="border-default group relative flex items-center rounded-md border text-sm transition-colors"
					:class="[
						isFocused(folder) ? 'bg-(--dms-accent-tint) border-primary' : 'hover:bg-(--dms-bg-muted)',
						drop.hoverFolderId.value === folder.id && 'ring-primary ring-2',
					]"
					role="listitem"
					:draggable="drop.canDragFolder(folder)"
					@dragstart="drop.startFolderDrag($event, folder)"
					@dragend="drop.endAssetDrag()"
					@dragover="drop.onFolderDragOver($event, folder)"
					@dragleave="drop.onFolderDragLeave(folder)"
					@drop="drop.onFolderDrop($event, folder)"
				>
					<div
						class="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md py-2.5 ps-3 pe-1 outline-none focus-visible:ring-2 focus-visible:ring-(--ui-primary)"
						role="button"
						data-folder-card
						:tabindex="tabIndexOf(index)"
						:aria-pressed="opensOnClick ? undefined : isFocused(folder)"
						@focus="focusedIndex = index"
						@click="onClick(folder)"
						@dblclick="library.openFolder(folder.id)"
						@keydown.enter.prevent="library.openFolder(folder.id)"
					>
						<FolderGlyph :folder="folder" />
						<span class="text-highlighted min-w-0 flex-1 truncate font-medium">{{ folder.name }}</span>
						<FolderMarkers :folder="folder" />
						<span
							v-if="!folder.shell"
							class="text-dimmed font-mono text-xs"
							:title="t('dms_media.explorer.count_with_subfolders', { count: format.formatNumber(folder.fileCount) }, folder.fileCount)"
						>
							{{ format.formatNumber(folder.fileCount) }}
						</span>
					</div>
					<UDropdownMenu :items="commands.folderMenu(folder)">
						<UButton
							icon="i-ph-dots-three"
							color="neutral"
							variant="ghost"
							size="xs"
							square
							class="me-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100"
							:tabindex="tabIndexOf(index)"
							:aria-label="t('dms_media.actions.folder_more', { name: folder.name })"
						/>
					</UDropdownMenu>
				</div>
			</UContextMenu>
		</div>
	</section>
</template>
