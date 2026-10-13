const STORAGE_KEY = 'dms-media:recent-move-destinations'
const MAX_RECENT = 3

function readStored(): string[] {
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
		return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
	} catch {
		return []
	}
}

/** The last folders files were moved to, remembered in this browser. */
export function useRecentDestinations() {
	const ids = ref<string[]>(typeof window === 'undefined' ? [] : readStored())

	function remember(folderId: string): void {
		ids.value = [folderId, ...ids.value.filter((id) => id !== folderId)].slice(0, MAX_RECENT)
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.value))
		} catch {
			return
		}
	}

	return { ids: readonly(ids), remember }
}
