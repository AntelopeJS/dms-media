export type ExplorerView = 'grid' | 'list' | 'columns'

export interface MediaPrefs {
	view: ExplorerView
	showDetails: boolean
	tileSize: number
	lastFolderId: string | null
	sidebarOpen: boolean
}

const STORAGE_KEY = 'dms-media-prefs'
const DEFAULT_PREFS: MediaPrefs = {
	view: 'grid',
	showDetails: true,
	tileSize: 168,
	lastFolderId: null,
	sidebarOpen: true,
}

const prefs = ref<MediaPrefs>({ ...DEFAULT_PREFS })
let isLoaded = false

function load(): void {
	if (isLoaded || typeof window === 'undefined') return
	isLoaded = true
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY)
		if (stored) prefs.value = { ...DEFAULT_PREFS, ...JSON.parse(stored) }
	} catch {
		prefs.value = { ...DEFAULT_PREFS }
	}
}

function save(): void {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs.value))
	} catch {
		return
	}
}

/** Explorer preferences kept per browser: view, details panel, tile size, last folder. */
export function useMediaPrefs() {
	onMounted(load)

	function update(patch: Partial<MediaPrefs>): void {
		prefs.value = { ...prefs.value, ...patch }
		save()
	}

	return { prefs: readonly(prefs), update }
}
