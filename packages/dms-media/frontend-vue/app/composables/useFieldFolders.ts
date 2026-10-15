import type { ComputedRef } from 'vue'
import type { BoundFolderAnswer, MediaFolder } from '../types/media'

interface FolderSource {
	/** The folder the field's binding created, when it has one the user can see. */
	boundFolder: ComputedRef<MediaFolder | undefined>
	folders: ComputedRef<MediaFolder[]>
	/** Whether the user may add files at the library's root. */
	canWriteRoot: ComputedRef<boolean>
	/** Reads the folders when they are not read yet. */
	ensureLoaded: () => Promise<void>
}

/**
 * A bound field only needs its own folder: it reads that one alone, not the
 * whole tree, with the page. A failed read keeps the folder last read.
 */
function useBoundFolder(bindingId: string): FolderSource {
	// Read again on each library change, its own trigger: the page's refreshes leave it alone.
	const read = useApiData<BoundFolderAnswer>(MEDIA_READS.boundFolder(bindingId), { refreshOnPageRefresh: false })
	const folder = computed(() => read.data.value?.folder ?? undefined)

	watch(
		read.data,
		(answer) => {
			if (answer) rememberUploadLimits(answer)
		},
		{ immediate: true },
	)
	onLibraryChange(() => read.refresh())

	return {
		boundFolder: folder,
		folders: computed(() => (folder.value ? [folder.value] : [])),
		canWriteRoot: computed(() => false),
		ensureLoaded: () => (read.data.value ? Promise.resolve() : read.refresh()),
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
