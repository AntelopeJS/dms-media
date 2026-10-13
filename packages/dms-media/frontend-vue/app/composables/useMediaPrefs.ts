import { createSharedComposable, useLocalStorage } from '@vueuse/core'
import type { AssetSortKey, SortDirection } from '../types/media'

export type ExplorerView = 'grid' | 'list' | 'columns'

export type ListColumn =
	'type' | 'size' | 'dimensions' | 'alt' | 'visibility' | 'added' | 'modified'

export interface ListingSort {
	sort: AssetSortKey
	direction: SortDirection
}

export interface MediaPrefs {
	view: ExplorerView
	showDetails: boolean
	tileSize: number
	lastFolderId: string | null
	sidebarOpen: boolean
	listColumns: ListColumn[]
	/** The order folders open in, as the reader last chose it. */
	sort: ListingSort
	/** The last folders files were moved to, most recent first. */
	recentDestinations: string[]
}

const STORAGE_KEY = 'dms-media-prefs'
const MAX_RECENT_DESTINATIONS = 3
const DEFAULT_PREFS: MediaPrefs = {
	view: 'grid',
	showDetails: true,
	tileSize: 168,
	lastFolderId: null,
	sidebarOpen: true,
	listColumns: ['type', 'size', 'alt', 'visibility', 'modified'],
	sort: { sort: 'name', direction: 'asc' },
	recentDestinations: [],
}

/** Read once mounted, so the server render and the first client render agree. */
const useStoredPrefs = createSharedComposable(() =>
	useLocalStorage<MediaPrefs>(STORAGE_KEY, DEFAULT_PREFS, {
		mergeDefaults: true,
		initOnMounted: true,
	}),
)

/** Explorer preferences kept per browser: view, details panel, tile size, list columns, sort, last and recent folders. */
export function useMediaPrefs() {
	const prefs = useStoredPrefs()

	function update(patch: Partial<MediaPrefs>): void {
		prefs.value = { ...prefs.value, ...patch }
	}

	function rememberDestination(folderId: string): void {
		const recent = [
			folderId,
			...prefs.value.recentDestinations.filter((id) => id !== folderId),
		]
		update({ recentDestinations: recent.slice(0, MAX_RECENT_DESTINATIONS) })
	}

	return { prefs: readonly(prefs), update, rememberDestination }
}
