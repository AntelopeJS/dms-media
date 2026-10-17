import type { InjectionKey } from 'vue'
import type { MediaAsset, MediaFolder } from '../../types/media'
import type { MediaLibrary } from './useMediaLibrary'

const ASSET_DRAG_TYPE = 'application/x-dms-media-assets'
const FOLDER_DRAG_TYPE = 'application/x-dms-media-folder'
const FILES_DRAG_TYPE = 'Files'
export const ROOT_DROP_ID = 'root'
const DROP_KEY: InjectionKey<ExplorerDrop> = Symbol('dms-media-explorer-drop')

export type DropUpload = (files: File[], folder: MediaFolder) => void

function carries(event: DragEvent, type: string): boolean {
	return Array.from(event.dataTransfer?.types ?? []).includes(type)
}

/** Drag files or folders onto folders to move them, or drop desktop files to upload them. */
export function createExplorerDrop(library: MediaLibrary, upload: DropUpload) {
	const hoverFolderId = ref<string | null>(null)
	const draggedIds = ref<string[]>([])
	const draggedFolder = ref<MediaFolder | null>(null)
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

	function canDragFolder(folder: MediaFolder): boolean {
		return library.mode === 'browse' && folder.rights.manage && !folder.bound
	}

	function startFolderDrag(event: DragEvent, folder: MediaFolder): void {
		if (!canDragFolder(folder)) return event.preventDefault()
		draggedFolder.value = folder
		event.dataTransfer?.setData(FOLDER_DRAG_TYPE, folder.id)
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
	}

	function endAssetDrag(): void {
		draggedIds.value = []
		draggedFolder.value = null
		hoverFolderId.value = null
	}

	/** A folder goes into another it can be managed in, never into itself or below. */
	function acceptsFolder(target: MediaFolder | null): boolean {
		const dragged = draggedFolder.value
		if (!dragged || dragged.parentId === (target?.id ?? null)) return false
		if (!target) return Boolean(library.tree.tree.value?.root.manage)
		if (!target.rights.manage || !target.acceptsSubfolders || target.id === dragged.id) return false
		return !library.tree.descendantsOf(dragged.id).some((child) => child.id === target.id)
	}

	function acceptsDrop(event: DragEvent, folder: MediaFolder): boolean {
		if (carries(event, FOLDER_DRAG_TYPE)) return acceptsFolder(folder)
		if (!folder.rights.write) return false
		if (carries(event, ASSET_DRAG_TYPE)) return library.mode === 'browse'
		return carries(event, FILES_DRAG_TYPE)
	}

	function onFolderDragOver(event: DragEvent, folder: MediaFolder): void {
		if (!acceptsDrop(event, folder)) return
		event.preventDefault()
		event.stopPropagation()
		if (event.dataTransfer)
			event.dataTransfer.dropEffect = carries(event, FILES_DRAG_TYPE) ? 'copy' : 'move'
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
		if (carries(event, FOLDER_DRAG_TYPE)) return moveDraggedFolder(folder)
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

	function moveDraggedFolder(target: MediaFolder | null): void {
		const dragged = draggedFolder.value
		const isAccepted = acceptsFolder(target)
		endAssetDrag()
		if (dragged && isAccepted) void library.actions.moveFolder(dragged, target?.id ?? null)
	}

	/** The library's root takes folders only: files always live in a folder. */
	function onRootDragOver(event: DragEvent): void {
		if (!carries(event, FOLDER_DRAG_TYPE) || !acceptsFolder(null)) return
		event.preventDefault()
		event.stopPropagation()
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
		hoverFolderId.value = ROOT_DROP_ID
	}

	function onRootDragLeave(): void {
		if (hoverFolderId.value === ROOT_DROP_ID) hoverFolderId.value = null
	}

	function onRootDrop(event: DragEvent): void {
		if (!carries(event, FOLDER_DRAG_TYPE)) return
		event.preventDefault()
		event.stopPropagation()
		moveDraggedFolder(null)
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
		draggedFolder,
		canDragFolder,
		startFolderDrag,
		onRootDragOver,
		onRootDragLeave,
		onRootDrop,
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
