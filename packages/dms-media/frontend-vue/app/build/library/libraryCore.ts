import type { MediaAsset, MediaFolder } from '../../types/media'
import type { MediaLibraryOptions } from '../../composables/library/useMediaLibrary'
import { type LibraryLocation, sameLocation } from '../../composables/library/useLibraryListing'

/** The explorer state and every action on the library, shared by its parts. */
export function createMediaLibrary(options: MediaLibraryOptions) {
	const api = useMediaApi()
	const { t } = useI18n()
	const toast = useToast()
	const { presentError } = useApiErrorPresenter()
	const previews = useMediaPreviews()
	const uploads = useUploadQueue()
	const tree = useLibraryTree({ scopeFolderId: options.scopeFolderId })
	const listing = useLibraryListing({
		scopeFolderId: options.scopeFolderId,
		tree,
		initialLocation: options.initialLocation,
		initialFilters: options.initialFilters,
	})
	const isPick = options.mode === 'pick'
	const selection = useLibrarySelection(listing.assets, isPick)
	const backStack = ref<LibraryLocation[]>([])
	const forwardStack = ref<LibraryLocation[]>([])
	const start = listing.location.value
	const lastFolderId = ref<string | null>(start.kind === 'folder' ? start.folderId : null)
	const beforeSearch = ref<LibraryLocation>(start.kind === 'search' ? { kind: 'root' } : start)
	const accept = options.accept ?? []
	const alreadyPicked = new Set(options.alreadyPicked ?? [])

	const currentFolder = computed(() => {
		const current = listing.location.value
		return current.kind === 'folder'
			? tree.foldersById.value.get(current.folderId)
			: undefined
	})

	const visibleFolders = computed<MediaFolder[]>(() => {
		const current = listing.location.value
		if (current.kind === 'root') return tree.childrenOf(null)
		if (current.kind === 'folder') return tree.childrenOf(current.folderId)
		return listing.extraFolders.value
	})

	const acceptedTypes = computed(() => fieldTypesLabel(accept, t))

	/** Why a picker cannot take a file, or nothing when it can. */
	function rejectionOf(asset: MediaAsset): string | undefined {
		if (alreadyPicked.has(asset.id)) return t('dms_media.picker.already_added')
		if (!acceptedTypes.value) return undefined
		if (matchesUploadType(asset.mimetype, accept)) return undefined
		return t('dms_media.picker.not_accepted', { types: acceptedTypes.value })
	}

	function notifyFailure(error: unknown, titleKey: string): void {
		presentError(error, { fallbackKey: titleKey })
	}

	async function open(next: LibraryLocation, remember = true): Promise<void> {
		if (remember && !sameLocation(next, listing.location.value)) {
			backStack.value = [...backStack.value, listing.location.value]
			forwardStack.value = []
		}
		if (!isPick) selection.clear()
		if (next.kind !== 'search') beforeSearch.value = next
		if (next.kind === 'folder') lastFolderId.value = next.folderId
		if (next.kind === 'root') lastFolderId.value = null
		await listing.setLocation(next)
	}

	function openFolder(folderId: string | null): Promise<void> {
		return open(folderId ? { kind: 'folder', folderId } : { kind: 'root' })
	}

	const isSearching = computed(() => listing.location.value.kind === 'search')

	async function back(): Promise<void> {
		const current = listing.location.value
		if (current.kind === 'search') {
			forwardStack.value = [current, ...forwardStack.value]
			return open(beforeSearch.value, false)
		}
		const previous = backStack.value.at(-1)
		if (!previous) return
		backStack.value = backStack.value.slice(0, -1)
		forwardStack.value = [current, ...forwardStack.value]
		await open(previous, false)
	}

	async function forward(): Promise<void> {
		const next = forwardStack.value[0]
		if (!next) return
		forwardStack.value = forwardStack.value.slice(1)
		if (!isSearching.value) backStack.value = [...backStack.value, listing.location.value]
		await open(next, false)
	}

	function search(query: string, scopeId?: string): Promise<void> {
		const trimmed = query.trim()
		if (!trimmed) return clearSearch()
		return open({ kind: 'search', query: trimmed, scopeId }, false)
	}

	function clearSearch(): Promise<void> {
		return open(beforeSearch.value, false)
	}

	return {
		mode: options.mode,
		remaining: options.remaining,
		accept,
		acceptedTypesLabel: acceptedTypes,
		rejectionOf,
		api,
		t,
		toast,
		previews,
		uploads,
		tree,
		listing,
		selection,
		currentFolder,
		visibleFolders,
		lastFolderId,
		canGoBack: computed(() => isSearching.value || backStack.value.length > 0),
		canGoForward: computed(() => forwardStack.value.length > 0),
		notifyFailure,
		open,
		openFolder,
		back,
		forward,
		search,
		clearSearch,
	}
}

/** The explorer state a media library shares with its parts, before its actions. */
export type LibraryCore = ReturnType<typeof createMediaLibrary>
