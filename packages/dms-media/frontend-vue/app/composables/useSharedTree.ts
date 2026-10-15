import type { MediaTree } from '../types/media'
import type { MediaApi } from './useMediaApi'

const DEFAULT_MAX_UPLOAD_BYTES = 500 * 1024 * 1024

/** What the library takes at all, from the module config: every upload is checked against it before it is sent. */
export interface UploadLimits {
	maxUploadBytes: number
	/** Mimetype patterns the library accepts; any type until the server says otherwise. */
	allowedMimetypes: readonly string[] | null
}

const limits = ref<UploadLimits>({
	maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
	allowedMimetypes: null,
})

/** The upload limits the server last sent, shared by every screen that uploads. */
export const uploadLimits = readonly(limits)

/** Keeps the upload limits a server answer carries: browser state, which a server render leaves alone. */
export function rememberUploadLimits(answer: UploadLimits): void {
	if (import.meta.env.SSR) return
	limits.value = {
		maxUploadBytes: answer.maxUploadBytes,
		allowedMimetypes: answer.allowedMimetypes,
	}
}

/** Reads the folder tree (counted over `scopeFolderId` when given) and keeps the upload limits it carries. */
export async function fetchTree(
	api: MediaApi,
	scopeFolderId?: string,
): Promise<MediaTree> {
	const tree = await api.tree(scopeFolderId)
	rememberUploadLimits(tree)
	return tree
}

/**
 * The folder tree every block of a page shares: read with the page (a server
 * render hands it over), read again on each library change, and kept in step
 * with the upload limits it carries.
 */
export function useSharedTree() {
	// Read again on each library change, its own trigger: the page's refreshes leave it alone.
	const read = useApiData<MediaTree>(MEDIA_READS.tree, { refreshOnPageRefresh: false })

	/** Reads the tree again; the blocks asking at once share one request. */
	function reload(): Promise<void> {
		return read.refresh({ dedupe: 'defer' })
	}

	watch(
		read.data,
		(tree) => {
			if (tree) rememberUploadLimits(tree)
		},
		{ immediate: true },
	)
	onLibraryChange(reload)

	return { tree: computed(() => read.data.value), reload }
}
