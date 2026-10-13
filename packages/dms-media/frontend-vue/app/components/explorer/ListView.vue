<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ListColumn } from '../../composables/useMediaPrefs'
import type { AssetSortKey, MediaAsset } from '../../types/media'
import AssetThumb from '../shared/AssetThumb.vue'

interface ColumnDefinition {
	id: ListColumn
	labelKey: string
	/** Lower shows first when the list has room for only some columns. */
	priority: number
	sort?: AssetSortKey
	align?: 'end'
}

const COLUMNS: ColumnDefinition[] = [
	{ id: 'type', labelKey: 'dms_media.columns.type', priority: 2, sort: 'type' },
	{ id: 'size', labelKey: 'dms_media.columns.size', priority: 1, sort: 'size', align: 'end' },
	{ id: 'dimensions', labelKey: 'dms_media.columns.dimensions', priority: 5 },
	{ id: 'alt', labelKey: 'dms_media.columns.alt', priority: 4 },
	{ id: 'visibility', labelKey: 'dms_media.columns.visibility', priority: 6 },
	{ id: 'added', labelKey: 'dms_media.columns.added', priority: 3, sort: 'date' },
	{ id: 'modified', labelKey: 'dms_media.columns.modified', priority: 7 },
]
const NAME_MIN_PX = 240
const COLUMN_MIN_PX = 110
const NEWEST_FIRST: AssetSortKey[] = ['date', 'size']

defineProps<{ assets: MediaAsset[] }>()
const { library, commands } = useExplorerContext()
const interactions = useAssetInteractions()
const navigation = useAssetNavigation()
const drop = useExplorerDrop()
const format = useMediaFormat()
const { prefs, update } = useMediaPrefs()
const { t } = useI18n()
const wrapper = useTemplateRef<HTMLElement>('wrapper')
const { width } = useElementSize(wrapper)

function folderPath(asset: MediaAsset): string {
	return folderPathLabel(library.tree.foldersById.value.get(asset.folderId), library.tree.foldersById.value)
}

const showPath = computed(() => library.listing.location.value.kind !== 'folder')
const allSelected = computed(
	() => library.listing.assets.value.length > 0 && library.selection.selectedIds.value.size === library.listing.assets.value.length,
)
const filters = computed(() => library.listing.filters.value)

/** The chosen columns that fit the list's own width, most useful first. */
const columns = computed(() => {
	const chosen = COLUMNS.filter((column) => prefs.value.listColumns.includes(column.id))
	if (width.value === 0) return chosen
	const budget = Math.max(Math.floor((width.value - NAME_MIN_PX) / COLUMN_MIN_PX), 1)
	const kept = new Set([...chosen].sort((left, right) => left.priority - right.priority).slice(0, budget))
	return chosen.filter((column) => kept.has(column))
})

const columnMenu = computed<DropdownMenuItem[]>(() => [
	{ type: 'label', label: t('dms_media.columns.choose') },
	...COLUMNS.map((column) => ({
		type: 'checkbox' as const,
		label: t(column.labelKey),
		checked: prefs.value.listColumns.includes(column.id),
		onUpdateChecked: (checked: boolean) => toggleColumn(column.id, checked),
		onSelect: (event: Event) => event.preventDefault(),
	})),
])

function toggleColumn(id: ListColumn, checked: boolean): void {
	const next = checked ? [...prefs.value.listColumns, id] : prefs.value.listColumns.filter((entry) => entry !== id)
	update({ listColumns: COLUMNS.map((column) => column.id).filter((entry) => next.includes(entry)) })
}

function sortState(key?: AssetSortKey): 'ascending' | 'descending' | undefined {
	if (!key || filters.value.sort !== key) return undefined
	return filters.value.direction === 'asc' ? 'ascending' : 'descending'
}

function sortBy(key: AssetSortKey): void {
	const isCurrent = filters.value.sort === key
	const direction = isCurrent
		? (filters.value.direction === 'asc' ? 'desc' : 'asc')
		: (NEWEST_FIRST.includes(key) ? 'desc' : 'asc')
	void library.listing.setFilters({ sort: key, direction })
}

function toggleAll(): void {
	if (allSelected.value) library.selection.clear()
	else library.selection.selectAll()
}
</script>

<template>
	<div v-if="assets.length" ref="wrapper" class="min-w-0">
		<table
			class="w-full text-[13px]"
			role="grid"
			:aria-multiselectable="library.remaining !== 1"
			:aria-label="t('dms_media.explorer.files')"
			:aria-rowcount="library.listing.total.value + 1"
		>
			<thead class="text-dimmed border-default border-b font-mono text-xs tracking-wider uppercase">
				<tr>
					<th class="w-10 py-2 ps-2 text-start">
						<UCheckbox v-if="library.mode === 'browse'" :model-value="allSelected" :aria-label="t('dms_media.actions.select_all')" @update:model-value="toggleAll" />
					</th>
					<th class="py-2 text-start font-medium" :aria-sort="sortState('name')">
						<button type="button" class="hover:text-highlighted inline-flex items-center gap-1 uppercase" @click="sortBy('name')">
							{{ t('dms_media.columns.name') }}
							<UIcon v-if="sortState('name')" :name="sortState('name') === 'ascending' ? 'i-ph-arrow-up' : 'i-ph-arrow-down'" class="size-3" />
						</button>
					</th>
					<th
						v-for="column in columns"
						:key="column.id"
						class="py-2 font-medium whitespace-nowrap"
						:class="column.align === 'end' ? 'pe-3 text-end' : 'pe-2 text-start'"
						:aria-sort="sortState(column.sort)"
					>
						<button v-if="column.sort" type="button" class="hover:text-highlighted inline-flex items-center gap-1 uppercase" @click="sortBy(column.sort)">
							{{ t(column.labelKey) }}
							<UIcon v-if="sortState(column.sort)" :name="sortState(column.sort) === 'ascending' ? 'i-ph-arrow-up' : 'i-ph-arrow-down'" class="size-3" />
						</button>
						<template v-else>{{ t(column.labelKey) }}</template>
					</th>
					<th class="w-10 py-1 pe-2 text-end">
						<UDropdownMenu :items="columnMenu">
							<UButton icon="i-ph-columns-plus-right" color="neutral" variant="ghost" size="xs" square :aria-label="t('dms_media.columns.choose')" />
						</UDropdownMenu>
					</th>
				</tr>
			</thead>
			<tbody @keydown="navigation.onKeydown">
				<UContextMenu v-for="asset in assets" :key="asset.id" :items="commands.fileMenu(asset)">
					<tr
						class="border-default border-b transition-colors outline-none last:border-b-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--ui-primary) focus-visible:outline-solid"
						:class="[
							interactions.isSelected(asset) ? 'bg-(--dms-accent-tint)' : 'hover:bg-(--dms-bg-muted)',
							interactions.isDisabled(asset) && 'opacity-60',
						]"
						:tabindex="navigation.tabIndexOf(asset)"
						:aria-selected="interactions.isSelected(asset)"
						:aria-disabled="interactions.isDisabled(asset)"
						:draggable="library.mode === 'browse'"
						:data-asset-id="asset.id"
						@focus="navigation.onFocus(asset)"
						@click="interactions.onClick($event, asset)"
						@dblclick="interactions.onOpen(asset)"
						@contextmenu="interactions.onContextMenu(asset)"
						@keydown.enter.prevent="interactions.onOpen(asset)"
						@dragstart="drop.startAssetDrag($event, asset)"
						@dragend="drop.endAssetDrag()"
					>
						<td class="py-1.5 ps-2">
							<span
								class="border-default flex size-4 items-center justify-center rounded-sm border"
								:class="interactions.isSelected(asset) ? 'border-primary bg-(--ui-primary) text-(--ui-bg)' : 'bg-(--dms-surface-card)'"
								aria-hidden="true"
								@click.stop="!interactions.isDisabled(asset) && interactions.onCheck(asset)"
								@dblclick.stop
							>
								<UIcon v-if="interactions.isSelected(asset)" name="i-ph-check-bold" class="size-3" />
							</span>
						</td>
						<td class="py-1.5">
							<div class="flex min-w-0 items-center gap-2.5">
								<AssetThumb :asset="asset" size="sm" />
								<div class="min-w-0">
									<p class="text-highlighted truncate font-medium">
										{{ asset.name }}
										<UIcon v-if="asset.starred" name="i-ph-star-fill" class="text-warning ms-1 size-3" />
									</p>
									<p v-if="showPath" class="text-dimmed truncate text-xs">
										{{ folderPath(asset) }}
										<span v-if="asset.matchedOn === 'alt'" class="text-primary ms-1 uppercase">{{ t('dms_media.search.matched_alt') }}</span>
									</p>
									<p v-if="interactions.disabledReason(asset)" class="text-muted truncate text-xs">
										{{ interactions.disabledReason(asset) }}
									</p>
								</div>
							</div>
						</td>
						<td
							v-for="column in columns"
							:key="column.id"
							class="py-1.5 whitespace-nowrap"
							:class="column.align === 'end' ? 'pe-3 text-end' : 'pe-2'"
						>
							<span v-if="column.id === 'type'" class="text-muted">{{ t(`dms_media.type_single.${asset.typeGroup}`) }}</span>
							<span v-else-if="column.id === 'size'" class="text-muted font-mono text-xs">{{ format.formatBytes(asset.size) }}</span>
							<span v-else-if="column.id === 'dimensions'" class="text-muted font-mono text-xs">{{ format.formatDimensions(asset.width, asset.height) || '—' }}</span>
							<template v-else-if="column.id === 'alt'">
								<template v-if="isImageAsset(asset)">
									<UBadge v-if="asset.alt" :label="t('dms_media.alt.set')" icon="i-ph-check" color="success" variant="subtle" size="sm" />
									<UBadge v-else :label="t('dms_media.alt.missing')" icon="i-ph-text-aa" color="warning" variant="subtle" size="sm" />
								</template>
								<span v-else class="text-dimmed">—</span>
							</template>
							<template v-else-if="column.id === 'visibility'">
								<span v-if="asset.visibility === 'inherit'" class="text-dimmed inline-flex items-center gap-1">
									<UIcon name="i-ph-arrow-elbow-left-up" class="size-3.5" />
									{{ t('dms_media.visibility.folder_short') }}
								</span>
								<span v-else class="inline-flex items-center gap-1" :class="asset.visibility === 'public' ? 'text-success' : 'text-muted'">
									<UIcon :name="asset.visibility === 'public' ? 'i-ph-globe' : 'i-ph-lock-simple'" class="size-3.5" />
									{{ t(`dms_media.visibility.${asset.visibility}`) }}
								</span>
							</template>
							<span v-else-if="column.id === 'added'" class="text-muted" :title="format.formatDateTime(asset.createdAt) ?? undefined">{{ format.formatDate(asset.createdAt) }}</span>
							<span v-else class="text-muted" :title="format.formatDateTime(asset.updatedAt) ?? undefined">{{ format.formatRelativeTime(asset.updatedAt) }}</span>
						</td>
						<td class="py-1.5 pe-2">
							<UDropdownMenu :items="commands.fileMenu(asset)">
								<UButton icon="i-ph-dots-three" color="neutral" variant="ghost" size="xs" square tabindex="-1" :aria-label="t('dms_media.actions.more')" @click.stop />
							</UDropdownMenu>
						</td>
					</tr>
				</UContextMenu>
			</tbody>
		</table>
	</div>
</template>
