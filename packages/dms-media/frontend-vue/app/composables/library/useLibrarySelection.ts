import type { MediaAsset } from '../../types/media'

export interface SelectionGesture {
	extend: boolean
	toggle: boolean
}

/** Which files are selected, with ⇧ ranges and ⌘ toggles over the visible order. */
export function useLibrarySelection(visible: Ref<MediaAsset[]>) {
	const selectedIds = ref<Set<string>>(new Set())
	const anchorId = ref<string | null>(null)
	const focusedFolderId = ref<string | null>(null)

	const selectedAssets = computed(() =>
		visible.value.filter((asset) => selectedIds.value.has(asset.id)),
	)
	const selectedSize = computed(() =>
		selectedAssets.value.reduce((total, asset) => total + asset.size, 0),
	)
	const focusedAsset = computed(() =>
		selectedAssets.value.length === 1 ? selectedAssets.value[0] : undefined,
	)

	function rangeIds(fromId: string, toId: string): string[] {
		const ids = visible.value.map((asset) => asset.id)
		const from = ids.indexOf(fromId)
		const to = ids.indexOf(toId)
		if (from < 0 || to < 0) return [toId]
		return ids.slice(Math.min(from, to), Math.max(from, to) + 1)
	}

	function select(assetId: string, gesture: SelectionGesture): void {
		focusedFolderId.value = null
		if (gesture.extend && anchorId.value) {
			selectedIds.value = new Set(rangeIds(anchorId.value, assetId))
			return
		}
		if (gesture.toggle) {
			const next = new Set(selectedIds.value)
			if (next.has(assetId)) next.delete(assetId)
			else next.add(assetId)
			selectedIds.value = next
		} else {
			selectedIds.value = new Set([assetId])
		}
		anchorId.value = assetId
	}

	function focusFolder(folderId: string | null): void {
		selectedIds.value = new Set()
		focusedFolderId.value = folderId
	}

	function selectAll(): void {
		selectedIds.value = new Set(visible.value.map((asset) => asset.id))
	}

	function clear(): void {
		selectedIds.value = new Set()
		anchorId.value = null
		focusedFolderId.value = null
	}

	function forget(ids: string[]): void {
		const next = new Set(selectedIds.value)
		ids.forEach((id) => next.delete(id))
		selectedIds.value = next
	}

	return {
		selectedIds,
		selectedAssets,
		selectedSize,
		focusedAsset,
		focusedFolderId,
		select,
		focusFolder,
		selectAll,
		clear,
		forget,
	}
}

export type LibrarySelection = ReturnType<typeof useLibrarySelection>
