import type { InjectionKey } from 'vue'
import type { MediaAsset, MediaFolder } from '../../types/media'
import type { MediaLibrary } from './useMediaLibrary'

const ASSET_DRAG_TYPE = 'application/x-dms-media-assets'
const FILES_DRAG_TYPE = 'Files'
const DROP_KEY: InjectionKey<ExplorerDrop> = Symbol('dms-media-explorer-drop')

export type DropUpload = (files: File[], folder: MediaFolder) => void

function carries(event: DragEvent, type: string): boolean {
	return Array.from(event.dataTransfer?.types ?? []).includes(type)
}

/** Drag files onto folders to move them, or drop desktop files to upload them. */
export function createExplorerDrop(library: MediaLibrary, upload: DropUpload) {
	const hoverFolderId = ref<string | null>(null)
	const draggedIds = ref<string[]>([])
	const isDraggingFiles = ref(false)
	const fileCount = ref(0)
	let enterDepth = 0

	function startAssetDrag(event: DragEvent, asset: MediaAsset): void {
		const selected = library.selection.selectedIds.value
		const ids = selected.has(asset.id) ? [...selected] : [asset.id]
		draggedIds.value = ids
		event.dataTransfer?.setData(ASSET_DRAG_TYPE, JSON.stringify(ids))
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
	}

	function endAssetDrag(): void {
		draggedIds.value = []
		hoverFolderId.value = null
	}

	function acceptsDrop(event: DragEvent, folder: MediaFolder): boolean {
		if (!folder.rights.write) return false
		if (carries(event, ASSET_DRAG_TYPE)) return library.mode === 'browse'
		return carries(event, FILES_DRAG_TYPE)
	}

	function onFolderDragOver(event: DragEvent, folder: MediaFolder): void {
		if (!acceptsDrop(event, folder)) return
		event.preventDefault()
		event.stopPropagation()
		if (event.dataTransfer)
			event.dataTransfer.dropEffect = carries(event, ASSET_DRAG_TYPE) ? 'move' : 'copy'
		hoverFolderId.value = folder.id
	}

	function onFolderDragLeave(folder: MediaFolder): void {
		if (hoverFolderId.value === folder.id) hoverFolderId.value = null
	}

	function onFolderDrop(event: DragEvent, folder: MediaFolder): void {
		if (!acceptsDrop(event, folder)) return
		event.preventDefault()
		event.stopPropagation()
		hoverFolderId.value = null
		resetFileDrag()
		const raw = event.dataTransfer?.getData(ASSET_DRAG_TYPE)
		if (raw) return moveDragged(JSON.parse(raw) as string[], folder)
		const files = Array.from(event.dataTransfer?.files ?? [])
		if (files.length) upload(files, folder)
	}

	function moveDragged(ids: string[], folder: MediaFolder): void {
		const assets = library.listing.assets.value.filter(
			(asset) => ids.includes(asset.id) && asset.folderId !== folder.id,
		)
		endAssetDrag()
		if (assets.length) void library.actions.moveAssets(assets, folder.id)
	}

	function onShellDragEnter(event: DragEvent): void {
		if (!carries(event, FILES_DRAG_TYPE)) return
		enterDepth += 1
		isDraggingFiles.value = true
		fileCount.value = event.dataTransfer?.items.length ?? 0
	}

	function onShellDragLeave(event: DragEvent): void {
		if (!carries(event, FILES_DRAG_TYPE)) return
		enterDepth = Math.max(enterDepth - 1, 0)
		if (enterDepth === 0) isDraggingFiles.value = false
	}

	function resetFileDrag(): void {
		enterDepth = 0
		isDraggingFiles.value = false
	}

	return {
		hoverFolderId,
		draggedIds,
		isDraggingFiles,
		fileCount,
		startAssetDrag,
		endAssetDrag,
		onFolderDragOver,
		onFolderDragLeave,
		onFolderDrop,
		onShellDragEnter,
		onShellDragLeave,
		resetFileDrag,
	}
}

export type ExplorerDrop = ReturnType<typeof createExplorerDrop>

export function provideExplorerDrop(drop: ExplorerDrop): void {
	provide(DROP_KEY, drop)
}

export function useExplorerDrop(): ExplorerDrop {
	const drop = inject(DROP_KEY)
	if (!drop) throw new Error('useExplorerDrop() needs a media explorer above it')
	return drop
}
