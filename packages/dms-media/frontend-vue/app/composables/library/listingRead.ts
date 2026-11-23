import type { ComputedRef } from "vue";
import type {
  AssetPage,
  MediaAsset,
  MediaFolder,
  TypeFacets,
} from "../../types/media";
import { type ListingPage, nextOffset } from "./listingEdits";
import type { createListingRequest } from "./listingRequest";

/** Where a page of the listing starts: the number of files loaded before it. */
type ListingCursor = number;

const PAGE_SIZE = 120;
/** Largest page the API serves, used to complete a long listing. */
const MAX_PAGE_SIZE = 500;
const EMPTY_PAGE: AssetPage = { assets: [], total: 0, facets: {} };
const NO_FACETS: TypeFacets = {};

/** The paged read of the listing, keyed by the location and the filters, and what the pages shown hold. */
export function createListingRead(
  listingKey: ComputedRef<string | null>,
  requestAt: ReturnType<typeof createListingRequest>["requestAt"],
) {
  let pageLimit = PAGE_SIZE;
  let shownPages = (): ListingPage[] => [];

  function limitOf(index: number): number {
    return shownPages()[index]?.limit ?? pageLimit;
  }

  const read = useApiPagedData<ListingPage, ListingCursor>(
    listingKey,
    async ({ $authFetch, cursor, index, signal }) => {
      const limit = limitOf(index);
      const request = requestAt(cursor ?? 0, limit);
      const page = request
        ? await $authFetch<AssetPage>(request.url, {
            query: request.query,
            signal,
          })
        : EMPTY_PAGE;
      return { ...page, limit };
    },
    {
      nextCursor: (page, pages) =>
        page.assets.length === 0 ? null : nextOffset(pages),
      refreshOnPageRefresh: false,
    },
  );

  shownPages = () => (read.placeholder.value ? [] : read.pages.value);
  const pages = computed<ListingPage[]>(() => shownPages());
  const lastPage = computed(() => pages.value.at(-1));
  const assets = computed<MediaAsset[]>(() =>
    pages.value.flatMap((page) => page.assets),
  );
  const total = computed(() => lastPage.value?.total ?? 0);
  const facets = computed(() => lastPage.value?.facets ?? NO_FACETS);
  const extraFolders = computed<MediaFolder[]>(
    () => lastPage.value?.folders ?? [],
  );
  const isLoading = computed(
    () =>
      read.loadingMore.value ||
      (read.pending.value &&
        (read.placeholder.value || pages.value.length === 0)),
  );
  const error = computed(() => (listingKey.value ? read.error.value : null));
  const hasMore = computed(() => read.hasMore.value);

  async function settled(): Promise<void> {
    await nextTick();
    if (!read.pending.value) return;
    await new Promise<void>((resolve) => {
      const stop = watch(read.pending, (pending) => {
        if (pending) return;
        stop();
        resolve();
      });
    });
  }

  function load(append = false): Promise<void> {
    return append ? read.loadMore() : read.refresh();
  }

  async function loadAll(): Promise<void> {
    pageLimit = MAX_PAGE_SIZE;
    try {
      let loaded = -1;
      while (read.hasMore.value && assets.value.length !== loaded) {
        loaded = assets.value.length;
        await read.loadMore();
      }
    } finally {
      pageLimit = PAGE_SIZE;
    }
  }

  return {
    read,
    pages,
    assets,
    total,
    facets,
    extraFolders,
    isLoading,
    error,
    hasMore,
    settled,
    load,
    loadAll,
  };
}
