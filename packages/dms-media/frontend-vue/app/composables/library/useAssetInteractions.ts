import type { MediaAsset } from '../../types/media'

/** Click, double-click and keyboard behaviour shared by every file view. */
export function useAssetInteractions() {
	const { library, commands } = useExplorerContext()
	const isPick = library.mode === 'pick'
	const selection = library.selection

	const hasSelection = computed(() => selection.selectedIds.value.size > 0)

	function isSelected(asset: MediaAsset): boolean {
		return selection.selectedIds.value.has(asset.id)
	}

	function isPickFull(): boolean {
		return library.remaining !== undefined && selection.selectedIds.value.size >= library.remaining
	}

	function onClick(event: MouseEvent, asset: MediaAsset): void {
		if (isPick) return togglePick(asset)
		selection.select(asset.id, {
			extend: event.shiftKey,
			toggle: event.metaKey || event.ctrlKey,
		})
	}

	function onCheck(asset: MediaAsset): void {
		if (isPick) return togglePick(asset)
		selection.select(asset.id, { extend: false, toggle: true })
	}

	function togglePick(asset: MediaAsset): void {
		if (library.rejectionOf(asset)) return
		const isPicked = isSelected(asset)
		if (!isPicked && library.remaining === 1) {
			selection.select(asset.id, { extend: false, toggle: false })
			return
		}
		if (!isPicked && isPickFull()) return
		selection.select(asset.id, { extend: false, toggle: true })
	}

	function onOpen(asset: MediaAsset): void {
		if (isPick) return togglePick(asset)
		commands.openDetails(asset)
	}

	function isDisabled(asset: MediaAsset): boolean {
		if (!isPick) return false
		if (library.rejectionOf(asset)) return true
		return !isSelected(asset) && isPickFull() && library.remaining !== 1
	}

	function disabledReason(asset: MediaAsset): string | undefined {
		if (!isPick) return undefined
		return (
			library.rejectionOf(asset) ??
			(isDisabled(asset) ? library.t('dms_media.picker.full') : undefined)
		)
	}

	return { hasSelection, isSelected, isDisabled, disabledReason, onClick, onCheck, onOpen }
}
