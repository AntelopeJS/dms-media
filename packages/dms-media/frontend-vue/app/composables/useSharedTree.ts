import type { MediaTree } from '../types/media'

const DEFAULT_MAX_UPLOAD_BYTES = 500 * 1024 * 1024

/** What the library takes at all, from the module config: every upload is checked against it before it is sent. */
export interface UploadLimits {
	maxUploadBytes: number
	/** Mimetype patterns the library accepts; any type until the server says otherwise. */
	allowedMimetypes: readonly string[] | null
}

const sharedTree = ref<MediaTree | null>(null)
const limits = ref<UploadLimits>({
	maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
	allowedMimetypes: null,
})
let pendingLoad: Promise<void> | null = null
let consumers = 0

/** The upload limits the server last sent, shared by every screen that uploads. */
export const uploadLimits = readonly(limits)

/** Keeps the upload limits a server answer carries. */
export function rememberUploadLimits(answer: UploadLimits): void {
	limits.value = {
		maxUploadBytes: answer.maxUploadBytes,
		allowedMimetypes: answer.allowedMimetypes,
	}
}

/** Reads the folder tree (counted over `scopeFolderId` when given) and keeps the upload limits it carries. */
export async function fetchTree(
	api: ReturnType<typeof useMediaApi>,
	scopeFolderId?: string,
): Promise<MediaTree> {
	const tree = await api.tree(scopeFolderId)
	rememberUploadLimits(tree)
	return tree
}

/**
 * The folder tree every block of a page shares: read once when the first block
 * mounts, read again on each library change, and dropped when the last block
 * leaves so the next page starts from fresh data.
 */
export function useSharedTree() {
	const api = useMediaApi()

	function reload(): Promise<void> {
		pendingLoad ??= fetchTree(api)
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
	onLibraryChange(reload)

	return { tree: computed(() => sharedTree.value), reload }
}
