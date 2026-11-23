import type {
  ApiDataContext,
  ApiDataResult,
} from "#dms-core/app/composables/auth/useApiData";
import type { AssetDetails, AssetPage, MediaAsset } from "../types/media";
import type { FileListingOrder } from "../utils/mediaFiles";

const SIBLINGS_PAGE_SIZE = 500;
const SIBLINGS_HALF_WINDOW = SIBLINGS_PAGE_SIZE / 2;
const SIBLINGS_EDGE_MARGIN = 20;
const DEFAULT_SIBLINGS_SORT = "name";

/** The page of the file's folder the previous and next files come from. */
interface SiblingsWindow {
  folderId: string;
  /** The order it was read in, as `orderKey` writes it. */
  order: string;
  /** A write may have moved the file among them: the next read of the file reads them again. */
  isStale?: boolean;
  assets: MediaAsset[];
  offset: number;
  total: number;
}

/** What the file page reads at once: the file, and the files around it in its folder. */
interface FileRead {
  details: AssetDetails;
  siblings: SiblingsWindow;
}

const orderKey = (order: FileListingOrder) =>
  JSON.stringify([order.sort, order.direction, order.type]);

function isNearWindowEdge(window: SiblingsWindow, id: string): boolean {
  const position = window.assets.findIndex((entry) => entry.id === id);
  if (position < 0) return true;
  const hasBefore = window.offset > 0;
  const hasAfter = window.offset + window.assets.length < window.total;
  return (
    (hasBefore && position < SIBLINGS_EDGE_MARGIN) ||
    (hasAfter && position >= window.assets.length - SIBLINGS_EDGE_MARGIN)
  );
}

async function readSiblings(
  fetch: ApiDataContext["$authFetch"],
  signal: AbortSignal,
  order: FileListingOrder,
  folderId: string,
  id: string,
): Promise<SiblingsWindow> {
  const page = (offset: number) =>
    fetch<AssetPage>(MEDIA_READS.folderAssets(folderId), {
      query: {
        ...order,
        sort: order.sort ?? DEFAULT_SIBLINGS_SORT,
        offset,
        limit: SIBLINGS_PAGE_SIZE,
      },
      signal,
    });
  let offset = 0;
  let found = await page(offset);
  const holds = (candidate: AssetPage) =>
    candidate.assets.some((entry) => entry.id === id);
  while (
    !holds(found) &&
    found.assets.length > 0 &&
    offset + found.assets.length < found.total
  ) {
    offset += found.assets.length;
    found = await page(offset);
  }
  const position = found.assets.findIndex((entry) => entry.id === id);
  const isInFirstHalf = offset === 0 && position < SIBLINGS_HALF_WINDOW;
  const centered =
    position < 0 || isInFirstHalf
      ? offset
      : Math.max(0, offset + position - SIBLINGS_HALF_WINDOW);
  if (centered !== offset) found = await page(centered);
  return {
    folderId,
    order: orderKey(order),
    assets: found.assets,
    offset: centered,
    total: found.total,
  };
}

/**
 * The file a page shows and the files around it in its folder, read with the
 * page under one key per file. Moving to the next file reads that file alone
 * while it sits well inside the neighbours already read.
 */
export function useFileRead(
  assetId: Ref<string | undefined>,
  order: Ref<FileListingOrder>,
) {
  const read: ApiDataResult<FileRead> = useApiData<FileRead>(
    () =>
      assetId.value
        ? `dms-media:file:${assetId.value}:${orderKey(order.value)}`
        : null,
    async ({ $authFetch, signal }): Promise<FileRead> => {
      const id = assetId.value;
      if (!id) throw new Error("A file is read by the id the page names");
      const details = await $authFetch<AssetDetails>(MEDIA_READS.details(id), {
        signal,
      });
      const previous = read.data.value?.siblings;
      const keepsWindow =
        previous !== undefined &&
        !previous.isStale &&
        previous.folderId === details.asset.folderId &&
        previous.order === orderKey(order.value) &&
        !isNearWindowEdge(previous, id);
      return {
        details,
        siblings: keepsWindow
          ? previous
          : await readSiblings(
              $authFetch,
              signal,
              order.value,
              details.asset.folderId,
              id,
            ),
      };
    },
    { refreshOnPageRefresh: false },
  );

  const error = computed(() => read.error.value);
  const details = computed(() =>
    error.value ? null : (read.data.value?.details ?? null),
  );
  const isDeleted = computed(
    () =>
      isNotFoundError(error.value) &&
      read.data.value?.details.asset.id === assetId.value,
  );
  const siblingsWindow = computed(() => read.data.value?.siblings);
  const siblings = computed(() => {
    const list = siblingsWindow.value?.assets ?? [];
    return isDeleted.value
      ? list.filter((entry) => entry.id !== assetId.value)
      : list;
  });
  const isLoading = computed(() => read.pending.value);
  const lastFolderId = computed(
    () => read.data.value?.details.asset.folderId ?? null,
  );

  function load(rereadSiblings = false): Promise<void> {
    const shown = read.data.value;
    if (rereadSiblings && shown)
      read.data.value = {
        ...shown,
        siblings: { ...shown.siblings, isStale: true },
      };
    return read.refresh({ dedupe: "defer" });
  }

  function patch(changes: Partial<MediaAsset>): void {
    const shown = read.data.value;
    if (!shown || error.value) return;
    const id = shown.details.asset.id;
    read.data.value = {
      details: {
        ...shown.details,
        asset: { ...shown.details.asset, ...changes },
      },
      siblings: {
        ...shown.siblings,
        assets: shown.siblings.assets.map((entry) =>
          entry.id === id ? { ...entry, ...changes } : entry,
        ),
      },
    };
  }

  return {
    error,
    details,
    isDeleted,
    siblingsWindow,
    siblings,
    isLoading,
    lastFolderId,
    load,
    patch,
  };
}
