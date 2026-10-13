import type { MediaAsset } from '../../types/media'
import type { ExplorerCommands } from './useExplorerCommands'
import type { ExplorerLayout } from './useExplorerLayout'
import type { MediaLibrary } from './useMediaLibrary'

/** Click, double-click and keyboard behaviour shared by every file view. */
export function createAssetInteractions(library: MediaLibrary, commands: ExplorerCommands, layout: ExplorerLayout) {
	const isPick = library.mode === 'pick'
	const selection = library.selection
	const format = useMediaFormat()

	const hasSelection = computed(() => selection.selectedIds.value.size > 0)

	function isSelected(asset: MediaAsset): boolean {
		return selection.selectedIds.value.has(asset.id)
	}

	function isPickFull(): boolean {
		return library.remaining !== undefined && selection.selectedIds.value.size >= library.remaining
	}

	function onClick(event: MouseEvent, asset: MediaAsset): void {
		if (isPick) return togglePick(asset)
		const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey
		if (layout.opensOnTap.value && !hasModifier && !hasSelection.value) return onOpen(asset)
		if (layout.opensOnTap.value && !hasModifier) return onCheck(asset)
		selection.select(asset.id, {
			extend: event.shiftKey,
			toggle: event.metaKey || event.ctrlKey,
		})
	}

	function onCheck(asset: MediaAsset): void {
		if (isPick) return togglePick(asset)
		selection.select(asset.id, { extend: false, toggle: true })
	}

	/** A right-click on a file outside the selection selects it, as in Finder. */
	function onContextMenu(asset: MediaAsset): void {
		if (isPick || isSelected(asset)) return
		selection.select(asset.id, { extend: false, toggle: false })
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

	/** What a screen reader says for a file: name, kind, size and alt text state. */
	function describe(asset: MediaAsset): string {
		const parts = [asset.name, library.t(`dms_media.type_single.${asset.typeGroup}`), format.formatBytes(asset.size)]
		if (needsAltText(asset)) parts.push(library.t('dms_media.alt.missing_long'))
		if (asset.starred) parts.push(library.t('dms_media.smart_views.starred'))
		return parts.join(', ')
	}

	return {
		hasSelection,
		isSelected,
		isDisabled,
		disabledReason,
		describe,
		onClick,
		onCheck,
		onContextMenu,
		onOpen,
	}
}

export type AssetInteractions = ReturnType<typeof createAssetInteractions>

export function useAssetInteractions(): AssetInteractions {
	const { library, commands } = useExplorerContext()
	return createAssetInteractions(library, commands, useExplorerLayout())
}
