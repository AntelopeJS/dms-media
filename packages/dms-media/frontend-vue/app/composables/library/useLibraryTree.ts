import type { MediaFolder, MediaTree } from "../../types/media";

function sortFolders(folders: MediaFolder[]): MediaFolder[] {
  return [...folders].sort((left, right) =>
    NAME_COLLATOR.compare(left.name, right.name),
  );
}

export interface LibraryTreeOptions {
  /** Folder the tree is rooted at, such as a picker's linked folder; the whole library when unset or unknown. */
  scopeFolderId?: string;
}

function subtreeIds(folders: MediaFolder[], rootId: string): Set<string> {
  const childIds = new Map<string, string[]>();
  for (const folder of folders) {
    if (folder.parentId)
      childIds.set(folder.parentId, [
        ...(childIds.get(folder.parentId) ?? []),
        folder.id,
      ]);
  }
  const ids = new Set([rootId]);
  const queue = [rootId];
  for (const parentId of queue) {
    for (const childId of childIds.get(parentId) ?? []) {
      ids.add(childId);
      queue.push(childId);
    }
  }
  return ids;
}

function withAdjustedCounts(
  tree: MediaTree,
  affected: ReadonlySet<string>,
  files: number,
  size: number,
): MediaTree {
  return {
    ...tree,
    root: {
      ...tree.root,
      fileCount: tree.root.fileCount + files,
      size: tree.root.size + size,
    },
    folders: tree.folders.map((folder) =>
      affected.has(folder.id)
        ? {
            ...folder,
            fileCount: folder.fileCount + files,
            size: folder.size + size,
          }
        : folder,
    ),
  };
}

/**
 * The folder tree the caller can see, with lookups by id and by parent. The
 * tree is read with the page (counted over the scope folder when given),
 * shared with the other blocks reading it, and read again on each library
 * change.
 */
export function useLibraryTree(options: LibraryTreeOptions = {}) {
  const read = useApiData<MediaTree>(MEDIA_READS.tree, {
    query: options.scopeFolderId
      ? { folderId: options.scopeFolderId }
      : undefined,
    refreshOnPageRefresh: false,
  });
  const tree = read.data;
  const isLoading = read.pending;
  const error = read.error;

  const allFolders = computed(() => tree.value?.folders ?? []);
  const scopeFolder = computed(() =>
    options.scopeFolderId
      ? allFolders.value.find((folder) => folder.id === options.scopeFolderId)
      : undefined,
  );
  const folders = computed(() => {
    if (!scopeFolder.value) return allFolders.value;
    const inScope = subtreeIds(allFolders.value, scopeFolder.value.id);
    return allFolders.value.filter((folder) => inScope.has(folder.id));
  });
  const foldersById = computed(
    () => new Map(folders.value.map((folder) => [folder.id, folder])),
  );
  const childrenByParent = computed(() => {
    const children = new Map<string | null, MediaFolder[]>();
    for (const folder of folders.value) {
      const key =
        folder.parentId && foldersById.value.has(folder.parentId)
          ? folder.parentId
          : null;
      children.set(key, [...(children.get(key) ?? []), folder]);
    }
    for (const [key, list] of children) children.set(key, sortFolders(list));
    return children;
  });

  function childrenOf(parentId: string | null): MediaFolder[] {
    return childrenByParent.value.get(parentId) ?? [];
  }

  function descendantsOf(folderId: string): MediaFolder[] {
    const result: MediaFolder[] = [];
    const queue = [folderId];
    for (const parentId of queue) {
      const children = childrenOf(parentId);
      result.push(...children);
      queue.push(...children.map((child) => child.id));
    }
    return result;
  }

  async function ready(): Promise<void> {
    await read;
  }

  function refresh(): Promise<void> {
    return read.refresh({ dedupe: "defer" });
  }

  watch(
    tree,
    (current) => {
      if (current) rememberUploadLimits(current);
    },
    { immediate: true },
  );

  function patchFolder(folderId: string, changes: Partial<MediaFolder>): void {
    if (!tree.value) return;
    tree.value = {
      ...tree.value,
      folders: tree.value.folders.map((folder) =>
        folder.id === folderId ? { ...folder, ...changes } : folder,
      ),
    };
  }

  function adjustCounts(folderId: string, files: number, size: number): void {
    if (!tree.value) return;
    const affected = new Set(
      folderAncestors(foldersById.value.get(folderId), foldersById.value).map(
        (folder) => folder.id,
      ),
    );
    tree.value = withAdjustedCounts(tree.value, affected, files, size);
  }

  function adjustView(view: keyof MediaTree["views"], delta: number): void {
    if (!tree.value) return;
    const count = Math.max(tree.value.views[view] + delta, 0);
    tree.value = {
      ...tree.value,
      views: { ...tree.value.views, [view]: count },
    };
  }

  function canWrite(folderId: string | null | undefined): boolean {
    if (!folderId) return false;
    return Boolean(foldersById.value.get(folderId)?.rights.write);
  }

  onLibraryChange(refresh);

  return {
    tree,
    isLoading,
    error,
    scopeFolder,
    folders,
    foldersById,
    childrenOf,
    descendantsOf,
    ready,
    refresh,
    patchFolder,
    adjustCounts,
    adjustView,
    canWrite,
  };
}

export type LibraryTree = ReturnType<typeof useLibraryTree>;
