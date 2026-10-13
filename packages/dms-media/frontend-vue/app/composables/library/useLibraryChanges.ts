import { useDebounceFn } from '@vueuse/core'

/** Changes landing this close together (a bulk move, an upload batch) trigger one reload. */
const RELOAD_DEBOUNCE_MS = 500

/**
 * Runs `reload` when the library changes, wherever the change came from: this
 * tab, another tab or a colleague. It follows the page's live mode as the
 * DMS blocks do: held while the page is paused, caught up on resume.
 */
export function onLibraryChange(reload: () => unknown): void {
	const scheduleReload = useDebounceFn(() => void reload(), RELOAD_DEBOUNCE_MS)
	usePageLiveRefresh(() => void scheduleReload(), {
		realtimeTopic: MEDIA_LIBRARY_TOPIC,
	})
}
