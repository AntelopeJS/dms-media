import type { MediaFolder, MediaTree } from '../../types/media'

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function sortFolders(folders: MediaFolder[]): MediaFolder[] {
	return [...folders].sort((left, right) => COLLATOR.compare(left.name, right.name))
}

/** The folder tree the caller can see, with lookups by id and by parent. */
export function useLibraryTree() {
	const api = useMediaApi()
	const tree = ref<MediaTree | null>(null)
	const isLoading = ref(false)
	const error = ref<unknown>(null)

	const folders = computed(() => tree.value?.folders ?? [])
	const foldersById = computed(
		() => new Map(folders.value.map((folder) => [folder.id, folder])),
	)
	const childrenByParent = computed(() => {
		const children = new Map<string | null, MediaFolder[]>()
		for (const folder of folders.value) {
			const key = folder.parentId && foldersById.value.has(folder.parentId)
				? folder.parentId
				: null
			children.set(key, [...(children.get(key) ?? []), folder])
		}
		for (const [key, list] of children) children.set(key, sortFolders(list))
		return children
	})

	function childrenOf(parentId: string | null): MediaFolder[] {
		return childrenByParent.value.get(parentId) ?? []
	}

	function descendantsOf(folderId: string): MediaFolder[] {
		const result: MediaFolder[] = []
		const queue = [folderId]
		while (queue.length > 0) {
			const children = childrenOf(queue.shift()!)
			result.push(...children)
			queue.push(...children.map((child) => child.id))
		}
		return result
	}

	async function refresh(): Promise<void> {
		isLoading.value = true
		try {
			tree.value = await api.tree()
			error.value = null
		} catch (cause) {
			error.value = cause
		} finally {
			isLoading.value = false
		}
	}

	function patchFolder(folderId: string, changes: Partial<MediaFolder>): void {
		if (!tree.value) return
		tree.value = {
			...tree.value,
			folders: tree.value.folders.map((folder) =>
				folder.id === folderId ? { ...folder, ...changes } : folder,
			),
		}
	}

	function adjustCounts(folderId: string, files: number, size: number): void {
		if (!tree.value) return
		const affected = new Set(
			folderAncestors(foldersById.value.get(folderId), foldersById.value).map(
				(folder) => folder.id,
			),
		)
		tree.value = {
			...tree.value,
			root: {
				...tree.value.root,
				fileCount: tree.value.root.fileCount + files,
				size: tree.value.root.size + size,
			},
			folders: tree.value.folders.map((folder) =>
				affected.has(folder.id)
					? {
							...folder,
							fileCount: folder.fileCount + files,
							size: folder.size + size,
						}
					: folder,
			),
		}
	}

	function canWrite(folderId: string | null | undefined): boolean {
		if (!folderId) return false
		return Boolean(foldersById.value.get(folderId)?.rights.write)
	}

	return {
		tree,
		isLoading,
		error,
		folders,
		foldersById,
		childrenOf,
		descendantsOf,
		refresh,
		patchFolder,
		adjustCounts,
		canWrite,
	}
}

export type LibraryTree = ReturnType<typeof useLibraryTree>
