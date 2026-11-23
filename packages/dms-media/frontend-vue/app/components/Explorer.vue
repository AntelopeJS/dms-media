<script setup lang="ts">
import {
  type LibraryLocation,
  type ListingFilters,
  sameLocation,
} from "../composables/library/useLibraryListing";
import type { AssetSortKey, SmartView, SortDirection } from "../types/media";
import ExplorerShell from "./explorer/ExplorerShell.vue";

type RouteQuery = {
  folder?: string;
  view?: string;
  q?: string;
  type?: string;
  sort?: string;
  direction?: string;
};
type QueryKey = keyof RouteQuery;

defineOptions({ name: "DmsMediaExplorer" });

const route = useDmsRoute();
const router = useDmsRouter();
const shell = useTemplateRef<InstanceType<typeof ExplorerShell>>("shell");
await useLibraryTree().ready();
const SMART_VIEWS: SmartView[] = [
  "recent",
  "starred",
  "missing-alt",
  "largest",
  "public",
];
const SORT_KEYS: AssetSortKey[] = ["name", "date", "size", "type"];
const DIRECTIONS: SortDirection[] = ["asc", "desc"];
const DEFAULT_ORDER = { sort: "name", direction: "asc" };
const QUERY_KEYS: QueryKey[] = [
  "folder",
  "view",
  "q",
  "type",
  "sort",
  "direction",
];

function readQuery(name: QueryKey): string | undefined {
  const value = route.query[name];
  return Array.isArray(value) ? undefined : value || undefined;
}

function readChoice<T extends string>(
  name: QueryKey,
  choices: readonly T[],
): T | undefined {
  const value = readQuery(name);
  return choices.find((choice) => choice === value);
}

function locationFromRoute(): LibraryLocation {
  const query = readQuery("q");
  if (query) return { kind: "search", query, scopeId: readQuery("folder") };
  const view = readChoice("view", SMART_VIEWS);
  if (view) return { kind: "view", view };
  const folderId = readQuery("folder");
  return folderId ? { kind: "folder", folderId } : { kind: "root" };
}

function filtersFromRoute(): Partial<ListingFilters> {
  const filters: Partial<ListingFilters> = {
    type: readChoice("type", TYPE_GROUP_ORDER),
  };
  const sort = readChoice("sort", SORT_KEYS);
  const direction = readChoice("direction", DIRECTIONS);
  if (sort) filters.sort = sort;
  if (direction) filters.direction = direction;
  return filters;
}

function locationQuery(location: LibraryLocation): RouteQuery {
  if (location.kind === "folder") return { folder: location.folderId };
  if (location.kind === "view") return { view: location.view };
  if (location.kind === "search")
    return location.scopeId
      ? { q: location.query, folder: location.scopeId }
      : { q: location.query };
  return {};
}

function filtersQuery(filters?: ListingFilters): RouteQuery {
  if (!filters) return {};
  const query: RouteQuery = filters.type ? { type: filters.type } : {};
  if (
    filters.sort !== DEFAULT_ORDER.sort ||
    filters.direction !== DEFAULT_ORDER.direction
  )
    Object.assign(query, { sort: filters.sort, direction: filters.direction });
  return query;
}

function keyOf(read: (name: QueryKey) => string | undefined): string {
  return QUERY_KEYS.map((name) => `${name}=${read(name) ?? ""}`).join("&");
}

const initialLocation = computed(locationFromRoute);
const initialFilters = computed(filtersFromRoute);
interface ShownState {
  location: LibraryLocation;
  filters?: ListingFilters;
}

const shown: ShownState = {
  location: locationFromRoute(),
};
const trail = useExplorerHistory(() => keyOf(readQuery));
let hasShownStart = false;

/** Opening a folder or a view is a step Back can return to; typing a search or sorting is not. */
function isNewStep(previous: LibraryLocation, next: LibraryLocation): boolean {
  if (sameLocation(previous, next)) return false;
  return !(previous.kind === "search" && next.kind === "search");
}

function shownQuery(): RouteQuery {
  return { ...locationQuery(shown.location), ...filtersQuery(shown.filters) };
}

function syncRoute(isStep: boolean): void {
  const query = shownQuery();
  const key = keyOf((name) => query[name]);
  if (trail.isShown(key)) return;
  trail.record(key, isStep);
  const to = { path: route.path, query };
  void (isStep ? router.push(to) : router.replace(to)).then(trail.mark);
}

function onLocation(location: LibraryLocation): void {
  const isStep =
    hasShownStart &&
    isNewStep(shown.location, location) &&
    !sameLocation(location, locationFromRoute());
  hasShownStart = true;
  shown.location = location;
  syncRoute(isStep);
}

function onFilters(filters: ListingFilters): void {
  shown.filters = filters;
  syncRoute(false);
}

/** The browser's Back and Forward move through the folders opened here. */
function followHistory(): void {
  const key = keyOf(readQuery);
  trail.follow(key);
  if (!hasShownStart || key === keyOf((name) => shownQuery()[name])) return;
  shown.location = locationFromRoute();
  void shell.value?.navigate(shown.location, filtersFromRoute());
}

watch(() => route.query, followHistory);
</script>

<template>
  <ExplorerShell
    ref="shell"
    class="flex-1"
    :initial-location="initialLocation"
    :initial-filters="initialFilters"
    :history="trail.history.value"
    @location="onLocation"
    @filters="onFilters"
  />
</template>
