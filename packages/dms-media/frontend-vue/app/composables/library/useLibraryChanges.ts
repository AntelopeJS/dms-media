import { useDebounceFn } from '@vueuse/core'

/** Changes landing this close together (a bulk move, an upload batch) trigger one reload. */
const RELOAD_DEBOUNCE_MS = 500

/**
 * Runs `reload` when the library changes, wherever the change came from: this
 * tab, another tab or a colleague. Only change events count, not the presence
 * snapshots the same topic carries.
 */
export function onLibraryChange(reload: () => unknown): void {
	const scheduleReload = useDebounceFn(() => void reload(), RELOAD_DEBOUNCE_MS)
	useRealtimeTopic(MEDIA_LIBRARY_TOPIC, (event) => {
		if ('type' in event) void scheduleReload()
	})
}
