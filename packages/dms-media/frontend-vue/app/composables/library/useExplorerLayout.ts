import { useElementSize, useMediaQuery } from '@vueuse/core'
import type { InjectionKey } from 'vue'
import type { ExplorerView } from '../useMediaPrefs'
import type { LibraryLocation } from './useLibraryListing'

export type ExplorerWidth = 'wide' | 'medium' | 'narrow'

/** Back and forward through the browser's history, when the explorer owns the URL. */
export interface ExplorerHistory {
	canGoBack: boolean
	canGoForward: boolean
	back: () => void
	forward: () => void
}

export interface ExplorerLayoutOptions {
	/** Folder the picker is limited to: the tree and the path start there. */
	scopeFolderId?: string
	/** Mimetype patterns a picker takes, for the texts that tell what to drop. */
	accept?: string[]
	history?: () => ExplorerHistory | undefined
}

/** From this width the tree and the details panel both sit beside the files. */
const WIDE_MIN_PX = 1000
/** From this width the tree sits beside the files; the details open as a drawer. */
const MEDIUM_MIN_PX = 700
const LAYOUT_KEY: InjectionKey<ExplorerLayout> = Symbol('dms-media-explorer-layout')

/** Columns follow the folder tree: search results and views show as a grid instead. */
export function effectiveViewOf(view: ExplorerView, location: LibraryLocation): ExplorerView {
	return view === 'columns' && !hasColumns(location) ? 'grid' : view
}

export function hasColumns(location: LibraryLocation): boolean {
	return location.kind === 'folder' || location.kind === 'root'
}

function widthOf(pixels: number): ExplorerWidth {
	if (pixels === 0 || pixels >= WIDE_MIN_PX) return 'wide'
	return pixels >= MEDIUM_MIN_PX ? 'medium' : 'narrow'
}

/**
 * How the explorer lays out at the width it is given, not the window's: the
 * dashboard's sidebar or the picker's dialog leave it less room. Narrow, the
 * tree and the details open as drawers and a tap opens what it lands on.
 */
export function createExplorerLayout(root: Readonly<Ref<HTMLElement | null>>, options: ExplorerLayoutOptions = {}) {
	const { width: pixels } = useElementSize(root)
	const width = computed(() => widthOf(pixels.value))
	const isCoarsePointer = useMediaQuery('(pointer: coarse)')
	const isSidebarDrawerOpen = ref(false)
	const isDetailsDrawerOpen = ref(false)
	const hasInlineSidebar = computed(() => width.value !== 'narrow')
	const hasInlineDetails = computed(() => width.value === 'wide')
	const opensOnTap = computed(() => isCoarsePointer.value || width.value === 'narrow')

	return {
		width,
		hasInlineSidebar,
		hasInlineDetails,
		opensOnTap,
		isSidebarDrawerOpen,
		isDetailsDrawerOpen,
		scopeFolderId: options.scopeFolderId,
		accept: options.accept ?? [],
		history: computed(() => options.history?.()),
	}
}

export type ExplorerLayout = ReturnType<typeof createExplorerLayout>

export function provideExplorerLayout(layout: ExplorerLayout): void {
	provide(LAYOUT_KEY, layout)
}

export function useExplorerLayout(): ExplorerLayout {
	const layout = inject(LAYOUT_KEY)
	if (!layout) throw new Error('useExplorerLayout() needs a media explorer above it')
	return layout
}
