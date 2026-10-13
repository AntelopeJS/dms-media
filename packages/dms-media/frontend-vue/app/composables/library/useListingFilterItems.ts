import type { DropdownMenuItem } from '@nuxt/ui'
import type {
	AssetSortKey,
	AssetTypeGroup,
	ModifiedWindow,
	OrientationFilter,
	VisibilityFilter,
} from '../../types/media'
import type { ListingFilters } from './useLibraryListing'
import type { MediaLibrary } from './useMediaLibrary'

type ChoiceFilter = 'visibility' | 'modified' | 'orientation'

const SORT_KEYS: AssetSortKey[] = ['name', 'date', 'size', 'type']
const FILTER_CHOICES: Record<ChoiceFilter, string[]> = {
	visibility: ['any', 'public', 'private'] satisfies VisibilityFilter[],
	modified: ['any', '7d', '30d', 'year'] satisfies ModifiedWindow[],
	orientation: ['any', 'landscape', 'portrait', 'square'] satisfies OrientationFilter[],
}
const FILTER_LABEL_PREFIXES: Record<ChoiceFilter, string> = {
	visibility: 'dms_media.search.visibility_',
	modified: 'dms_media.search.modified_',
	orientation: 'dms_media.filters.orientation_',
}
const FILTER_ICONS: Record<ChoiceFilter, string> = {
	visibility: 'i-ph-globe',
	modified: 'i-ph-calendar-blank',
	orientation: 'i-ph-crop',
}
const FILTER_ORDER: ChoiceFilter[] = ['visibility', 'modified', 'orientation']

/** The sort, type and facet menus of the explorer header, bound to the listing filters. */
export function useListingFilterItems(library: MediaLibrary) {
	const { t } = useI18n()
	const format = useMediaFormat()
	const filters = computed(() => library.listing.filters.value)
	const facets = computed(() => library.listing.facets.value)

	function setFilters(changes: Partial<ListingFilters>): void {
		void library.listing.setFilters(changes)
	}

	const sortItems = computed<DropdownMenuItem[][]>(() => [
		SORT_KEYS.map((sort) => ({
			label: t(`dms_media.sort.${sort}`),
			type: 'checkbox' as const,
			checked: filters.value.sort === sort,
			onSelect: () => setFilters({ sort }),
		})),
		(['asc', 'desc'] as const).map((direction) => ({
			label: t(`dms_media.sort.${direction}`),
			type: 'checkbox' as const,
			checked: filters.value.direction === direction,
			onSelect: () => setFilters({ direction }),
		})),
	])

	const typeEntries = computed(() =>
		TYPE_GROUP_ORDER.filter((group) => (facets.value[group] ?? 0) > 0).map((group) => ({
			group,
			count: facets.value[group] ?? 0,
		})),
	)

	function setType(type: AssetTypeGroup | undefined): void {
		setFilters({ type })
	}

	const typeItems = computed<DropdownMenuItem[]>(() => [
		{ label: t('dms_media.types.all'), type: 'checkbox', checked: !filters.value.type, onSelect: () => setType(undefined) },
		...typeEntries.value.map((entry) => ({
			label: t(`dms_media.types.${entry.group}`),
			icon: TYPE_GROUP_ICONS[entry.group],
			suffix: format.formatNumber(entry.count),
			type: 'checkbox' as const,
			checked: filters.value.type === entry.group,
			onSelect: () => setType(entry.group),
		})),
	])

	function choiceItems(filter: ChoiceFilter): DropdownMenuItem[] {
		return FILTER_CHOICES[filter].map((value) => ({
			label: t(`${FILTER_LABEL_PREFIXES[filter]}${value}`),
			type: 'checkbox' as const,
			checked: filters.value[filter] === value,
			onSelect: () => setFilters({ [filter]: value } as Partial<ListingFilters>),
		}))
	}

	function choiceLabel(filter: ChoiceFilter): string {
		return t(`${FILTER_LABEL_PREFIXES[filter]}${filters.value[filter]}`)
	}

	const activeFacetCount = computed(() => FILTER_ORDER.filter((filter) => filters.value[filter] !== 'any').length)

	const facetItems = computed<DropdownMenuItem[][]>(() =>
		FILTER_ORDER.map((filter) => [
			{ type: 'label' as const, label: t(`dms_media.filters.${filter}`), icon: FILTER_ICONS[filter] },
			...choiceItems(filter),
		]),
	)

	return {
		sortItems,
		typeEntries,
		typeItems,
		setType,
		choiceItems,
		choiceLabel,
		facetItems,
		activeFacetCount,
		filterIcons: FILTER_ICONS,
	}
}
