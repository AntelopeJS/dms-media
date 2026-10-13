import type { MediaTree } from '../types/media'

const sharedTree = ref<MediaTree | null>(null)
let pendingLoad: Promise<void> | null = null
let consumers = 0

/**
 * The folder tree every block of a page shares: read once when the first block
 * mounts, read again on each library change, and dropped when the last block
 * leaves so the next page starts from fresh data.
 */
export function useSharedTree() {
	const api = useMediaApi()

	function reload(): Promise<void> {
		if (pendingLoad) return pendingLoad
		pendingLoad = api
			.tree()
			.then((tree) => {
				sharedTree.value = tree
			})
			.catch(() => undefined)
			.finally(() => {
				pendingLoad = null
			})
		return pendingLoad
	}

	consumers += 1
	onScopeDispose(() => {
		consumers -= 1
		if (consumers === 0) sharedTree.value = null
	})
	onMounted(() => {
		if (!sharedTree.value) void reload()
	})
	useRealtimeTopic(MEDIA_LIBRARY_TOPIC, (event) => {
		if ('type' in event) void reload()
	})

	return { tree: computed(() => sharedTree.value), reload }
}
