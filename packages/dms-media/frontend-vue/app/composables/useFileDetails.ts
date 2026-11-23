import type { FileListingOrder } from "../utils/mediaFiles";

/**
 * One file of the library, its neighbours in the folder (in the order and
 * filter the explorer showed them in) and the writes on it. The file and its
 * neighbours are read with the page, under one key per file: the page's blocks
 * share the read, and a server render hands it over. Moving to the next file
 * reads that file alone while it sits well inside the neighbours already read.
 * It follows the library's realtime topic, so a change made elsewhere (a
 * revert, a rename, a deletion) shows at once.
 */
export function useFileDetails(
  assetId: Ref<string | undefined>,
  order: Ref<FileListingOrder> = ref({}),
) {
  const { tree, refresh: refreshTree } = useLibraryTree();
  const {
    error,
    details,
    isDeleted,
    siblingsWindow,
    siblings,
    isLoading,
    lastFolderId,
    load,
    patch,
  } = useFileRead(assetId, order);

  const asset = computed(() => details.value?.asset);
  const localIndex = computed(() =>
    siblings.value.findIndex((entry) => entry.id === assetId.value),
  );
  const index = computed(() =>
    localIndex.value < 0
      ? -1
      : (siblingsWindow.value?.offset ?? 0) + localIndex.value,
  );
  const total = computed(() => siblingsWindow.value?.total ?? 0);
  const previous = computed(() =>
    localIndex.value > 0 ? siblings.value[localIndex.value - 1] : undefined,
  );
  const next = computed(() =>
    localIndex.value >= 0 && localIndex.value < siblings.value.length - 1
      ? siblings.value[localIndex.value + 1]
      : undefined,
  );
  const canWrite = computed(() => Boolean(details.value?.folder.rights.write));
  const canChangeVisibility = computed(
    () =>
      Boolean(details.value?.folder.rights.manage) &&
      Boolean(tree.value?.isOwner),
  );
  const writes = useFileWrites({ asset, load, patch });

  function refresh(): void {
    if (assetId.value) void load(true);
  }

  onLibraryChange(refresh);

  return {
    details,
    asset,
    siblings,
    tree,
    index,
    total,
    previous,
    next,
    isLoading,
    error,
    isDeleted,
    lastFolderId,
    canWrite,
    canChangeVisibility,
    refresh,
    refreshTree,
    ...writes,
  };
}
