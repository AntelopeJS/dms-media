import type { InjectionKey } from 'vue'
import type { MediaAsset } from '../../types/media'
import type { MediaLibrary } from './useMediaLibrary'

const NAVIGATION_KEY: InjectionKey<AssetNavigation> = Symbol('dms-media-asset-navigation')
const ITEM_SELECTOR = '[data-asset-id]'

/**
 * Keyboard moves over the files of every view: one Tab stop, arrows to move
 * and select, ⇧ arrows to extend, Space to tick in the picker (⌘ Space in
 * the library, where Space previews).
 */
export function createAssetNavigation(library: MediaLibrary, toggle: (asset: MediaAsset) => void) {
	const activeId = ref<string | null>(null)
	const assets = library.listing.assets
	const isPick = library.mode === 'pick'

	const currentId = computed(() => {
		const ids = assets.value.map((asset) => asset.id)
		if (activeId.value && ids.includes(activeId.value)) return activeId.value
		const shownSelection = library.selection.selectedAssets.value.find((asset) => ids.includes(asset.id))
		return shownSelection?.id ?? ids[0] ?? null
	})

	function tabIndexOf(asset: MediaAsset): 0 | -1 {
		return asset.id === currentId.value ? 0 : -1
	}

	function onFocus(asset: MediaAsset): void {
		activeId.value = asset.id
	}

	function moveTo(container: HTMLElement, target: MediaAsset, extend: boolean): void {
		activeId.value = target.id
		if (!isPick) library.selection.select(target.id, { extend, toggle: false })
		const item = container.querySelector<HTMLElement>(`[data-asset-id="${CSS.escape(target.id)}"]`)
		focusInView(item)
	}

	function onSpace(event: KeyboardEvent): void {
		const asset = assets.value.find((entry) => entry.id === currentId.value)
		const isToggle = isPick || event.metaKey || event.ctrlKey
		if (!asset || !isToggle) return
		event.preventDefault()
		event.stopPropagation()
		toggle(asset)
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === ' ') return onSpace(event)
		if (!isGridKey(event.key) || event.altKey || event.metaKey || event.ctrlKey) return
		const container = event.currentTarget as HTMLElement
		const items = Array.from(container.querySelectorAll<HTMLElement>(ITEM_SELECTOR))
		const index = assets.value.findIndex((asset) => asset.id === currentId.value)
		const next = gridIndexAfter(event.key, index, assets.value.length, gridColumnsOf(items))
		event.preventDefault()
		const target = next === undefined ? undefined : assets.value[next]
		if (target) moveTo(container, target, event.shiftKey)
	}

	return { currentId, tabIndexOf, onFocus, onKeydown }
}

export type AssetNavigation = ReturnType<typeof createAssetNavigation>

export function provideAssetNavigation(navigation: AssetNavigation): void {
	provide(NAVIGATION_KEY, navigation)
}

export function useAssetNavigation(): AssetNavigation {
	const navigation = inject(NAVIGATION_KEY)
	if (!navigation) throw new Error('useAssetNavigation() needs a media explorer above it')
	return navigation
}
