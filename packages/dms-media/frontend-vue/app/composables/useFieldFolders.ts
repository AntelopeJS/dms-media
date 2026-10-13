import type { ComputedRef } from 'vue'
import type { MediaFolder } from '../types/media'

interface FolderSource {
	/** The folder the field's binding created, when it has one the user can see. */
	boundFolder: ComputedRef<MediaFolder | undefined>
	folders: ComputedRef<MediaFolder[]>
	/** Whether the user may add files at the library's root. */
	canWriteRoot: ComputedRef<boolean>
	/** Reads the folders when they are not read yet. */
	ensureLoaded: () => Promise<void>
}

/** A bound field only needs its own folder: it reads that one alone, not the whole tree. */
function useBoundFolder(bindingId: string): FolderSource {
	const api = useMediaApi()
	const folder = ref<MediaFolder | null>(null)
	const isLoaded = ref(false)

	async function load(): Promise<void> {
		const answer = await api.boundFolder(bindingId).catch(() => null)
		if (!answer) return
		rememberUploadLimits(answer)
		folder.value = answer.folder
		isLoaded.value = true
	}

	onMounted(() => void load())
	onLibraryChange(load)

	return {
		boundFolder: computed(() => folder.value ?? undefined),
		folders: computed(() => (folder.value ? [folder.value] : [])),
		canWriteRoot: computed(() => false),
		ensureLoaded: () => (isLoaded.value ? Promise.resolve() : load()),
	}
}

/** A field without a binding picks anywhere: it shares the page's folder tree. */
function useTreeFolders(): FolderSource {
	const { tree, reload } = useSharedTree()
	return {
		boundFolder: computed(() => undefined),
		folders: computed(() => tree.value?.folders ?? []),
		canWriteRoot: computed(() => Boolean(tree.value?.root.write)),
		ensureLoaded: () => (tree.value ? Promise.resolve() : reload()),
	}
}

/** The folders an asset field works with, by id. */
export function useFieldFolders(bindingId: string | undefined) {
	const source = bindingId ? useBoundFolder(bindingId) : useTreeFolders()
	const foldersById = computed(
		() => new Map(source.folders.value.map((folder) => [folder.id, folder])),
	)
	return { ...source, foldersById }
}
