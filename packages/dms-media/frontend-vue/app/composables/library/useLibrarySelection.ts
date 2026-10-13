import type { MediaAsset } from '../../types/media'

export interface SelectionGesture {
	extend: boolean
	toggle: boolean
}

/**
 * Which files are selected, with ⇧ ranges and ⌘ toggles over the visible order.
 * A kept selection (the picker's) holds on to files that leave the view, so a
 * choice can span folders and searches.
 */
export function useLibrarySelection(visible: Ref<MediaAsset[]>, isKept = false) {
	const selectedIds = ref<Set<string>>(new Set())
	const anchorId = ref<string | null>(null)
	const focusedFolderId = ref<string | null>(null)
	const keptAssets = shallowRef(new Map<string, MediaAsset>())

	const selectedAssets = computed(() => (isKept ? keptSelection() : visibleSelection()))
	const selectedSize = computed(() =>
		selectedAssets.value.reduce((total, asset) => total + asset.size, 0),
	)
	const focusedAsset = computed(() =>
		selectedAssets.value.length === 1 ? selectedAssets.value[0] : undefined,
	)

	function visibleSelection(): MediaAsset[] {
		return visible.value.filter((asset) => selectedIds.value.has(asset.id))
	}

	function keptSelection(): MediaAsset[] {
		const visibleById = new Map(visible.value.map((asset) => [asset.id, asset]))
		return [...selectedIds.value].flatMap((id) => {
			const asset = visibleById.get(id) ?? keptAssets.value.get(id)
			return asset ? [asset] : []
		})
	}

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

	watch(visible, (assets) => {
		const present = new Set(assets.map((asset) => asset.id))
		const gone = [...selectedIds.value].filter((id) => !present.has(id))
		if (gone.length > 0 && !isKept) forget(gone)
		if (anchorId.value && !present.has(anchorId.value)) anchorId.value = null
	})

	if (isKept) {
		watch([selectedIds, visible], () => {
			keptAssets.value = new Map(keptSelection().map((asset) => [asset.id, asset]))
		}, { flush: 'sync' })
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
