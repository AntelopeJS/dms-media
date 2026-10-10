<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { AssetSortKey, AssetTypeGroup, ModifiedWindow, VisibilityFilter } from '../../types/media'

const { library } = useExplorerContext()
const { t } = useI18n()
const format = useMediaFormat()

const location = computed(() => library.listing.location.value)
const folder = computed(() => library.currentFolder.value)
const filters = computed(() => library.listing.filters.value)
const facets = computed(() => library.listing.facets.value)
const subfolderCount = computed(() => library.visibleFolders.value.length)

const title = computed(() => {
	const current = location.value
	if (current.kind === 'folder') return folder.value?.name ?? ''
	if (current.kind === 'view') return t(`dms_media.smart_views.${current.view}`)
	if (current.kind === 'search') return t('dms_media.search.results_for', { query: current.query })
	return t('dms_media.library.root')
})

const summary = computed(() => {
	const parts: string[] = []
	if (location.value.kind === 'folder' || location.value.kind === 'root')
		parts.push(t('dms_media.explorer.folder_count', { count: subfolderCount.value }, subfolderCount.value))
	if (location.value.kind !== 'root')
		parts.push(t('dms_media.explorer.file_count', { count: library.listing.total.value }, library.listing.total.value))
	if (folder.value) parts.push(format.formatBytes(folder.value.size))
	return parts.join(' · ')
})

const sortLabels = computed<Record<AssetSortKey, string>>(() => ({
	name: t('dms_media.sort.name'),
	date: t('dms_media.sort.date'),
	size: t('dms_media.sort.size'),
	type: t('dms_media.sort.type'),
}))

const sortItems = computed<DropdownMenuItem[][]>(() => [
	(Object.keys(sortLabels.value) as AssetSortKey[]).map((sort) => ({
		label: sortLabels.value[sort],
		type: 'checkbox' as const,
		checked: filters.value.sort === sort,
		onSelect: () => void library.listing.setFilters({ sort }),
	})),
	[
		{ label: t('dms_media.sort.asc'), type: 'checkbox' as const, checked: filters.value.direction === 'asc', onSelect: () => void library.listing.setFilters({ direction: 'asc' }) },
		{ label: t('dms_media.sort.desc'), type: 'checkbox' as const, checked: filters.value.direction === 'desc', onSelect: () => void library.listing.setFilters({ direction: 'desc' }) },
	],
])

const typeEntries = computed(() =>
	TYPE_GROUP_ORDER.filter((group) => (facets.value[group] ?? 0) > 0).map((group) => ({
		group,
		count: facets.value[group] ?? 0,
	})),
)

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

function setType(type: AssetTypeGroup | undefined): void {
	void library.listing.setFilters({ type })
}

const scopeItems = computed<DropdownMenuItem[]>(() => {
	const current = location.value
	if (current.kind !== 'search') return []
	const origin = library.lastFolderId.value
		? library.tree.foldersById.value.get(library.lastFolderId.value)
		: undefined
	return [
		{ label: t('dms_media.search.scope_all'), type: 'checkbox', checked: !current.scopeId, onSelect: () => void library.search(current.query) },
		...(origin
			? [{
					label: origin.name,
					icon: 'i-ph-folder-simple',
					type: 'checkbox' as const,
					checked: current.scopeId === origin.id,
					onSelect: () => void library.search(current.query, origin.id),
				}]
			: []),
	]
})

const scopeLabel = computed(() => {
	const current = location.value
	if (current.kind !== 'search' || !current.scopeId) return t('dms_media.search.scope_all')
	return library.tree.foldersById.value.get(current.scopeId)?.name ?? t('dms_media.search.scope_all')
})

const visibilityItems = computed<DropdownMenuItem[]>(() =>
	(['any', 'public', 'private'] as VisibilityFilter[]).map((visibility) => ({
		label: t(`dms_media.search.visibility_${visibility}`),
		type: 'checkbox' as const,
		checked: filters.value.visibility === visibility,
		onSelect: () => void library.listing.setFilters({ visibility }),
	})),
)

const modifiedItems = computed<DropdownMenuItem[]>(() =>
	(['any', '7d', '30d', 'year'] as ModifiedWindow[]).map((modified) => ({
		label: t(`dms_media.search.modified_${modified}`),
		type: 'checkbox' as const,
		checked: filters.value.modified === modified,
		onSelect: () => void library.listing.setFilters({ modified }),
	})),
)
</script>

<template>
	<div class="border-default flex flex-col gap-2 border-b px-4 py-3">
		<div class="flex flex-wrap items-start gap-3">
			<div class="min-w-0 flex-1">
				<h2 class="text-highlighted truncate text-lg font-semibold tracking-tight">{{ title }}</h2>
				<div class="text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
					<span class="font-mono text-xs">{{ summary }}</span>
					<template v-if="folder">
						<UBadge
							:label="t(`dms_media.visibility.${folder.visibility}`)"
							:icon="folder.visibility === 'public' ? 'i-ph-globe' : 'i-ph-lock-simple'"
							:color="folder.visibility === 'public' ? 'success' : 'neutral'"
							variant="subtle"
							size="sm"
						/>
						<UBadge v-if="folder.hasOwnAcl && !folder.bound" :label="t('dms_media.markers.own_rules')" icon="i-ph-shield-check" color="warning" variant="subtle" size="sm" />
						<UBadge v-if="folder.bound" :label="t('dms_media.markers.linked_to', { binding: folder.binding })" icon="i-ph-link-simple" color="primary" variant="subtle" size="sm" />
						<UBadge v-if="!folder.rights.write" :label="t('dms_media.markers.read_only')" icon="i-ph-eye" color="neutral" variant="outline" size="sm" />
					</template>
					<span v-if="location.kind === 'search'">{{ t('dms_media.search.where') }}</span>
				</div>
			</div>
			<UButton
				v-if="location.kind === 'search'"
				icon="i-ph-x"
				color="neutral"
				variant="ghost"
				size="sm"
				:label="t('dms_media.search.clear')"
				@click="library.clearSearch()"
			/>
			<div v-if="location.kind !== 'root'" class="flex items-center gap-2">
				<UDropdownMenu v-if="location.kind !== 'search'" :items="typeItems">
					<UButton
						icon="i-ph-funnel"
						color="neutral"
						variant="outline"
						size="sm"
						trailing-icon="i-ph-caret-down"
						:label="filters.type ? t(`dms_media.types.${filters.type}`) : t('dms_media.types.all')"
					/>
				</UDropdownMenu>
				<UDropdownMenu :items="sortItems">
					<UButton
						:icon="filters.direction === 'asc' ? 'i-ph-sort-ascending' : 'i-ph-sort-descending'"
						color="neutral"
						variant="outline"
						size="sm"
						trailing-icon="i-ph-caret-down"
						:label="sortLabels[filters.sort]"
					/>
				</UDropdownMenu>
			</div>
		</div>
		<div v-if="location.kind === 'search'" class="flex flex-wrap items-center gap-1.5">
			<UButton
				:label="t('dms_media.types.all')"
				size="xs"
				:color="!filters.type ? 'primary' : 'neutral'"
				:variant="!filters.type ? 'soft' : 'outline'"
				@click="setType(undefined)"
			>
				<template #trailing>
					<span class="font-mono text-[11px]">{{ facets.all ?? 0 }}</span>
				</template>
			</UButton>
			<UButton
				v-for="entry in typeEntries"
				:key="entry.group"
				:icon="TYPE_GROUP_ICONS[entry.group]"
				:label="t(`dms_media.types.${entry.group}`)"
				size="xs"
				:color="filters.type === entry.group ? 'primary' : 'neutral'"
				:variant="filters.type === entry.group ? 'soft' : 'outline'"
				@click="setType(entry.group)"
			>
				<template #trailing>
					<span class="font-mono text-[11px]">{{ entry.count }}</span>
				</template>
			</UButton>
			<UBadge
				v-if="library.listing.extraFolders.value.length"
				icon="i-ph-folder-simple"
				:label="t('dms_media.search.folders', { count: library.listing.extraFolders.value.length })"
				color="neutral"
				variant="outline"
			/>
			<span class="bg-(--ui-border) mx-1 h-4 w-px" />
			<UDropdownMenu :items="scopeItems">
				<UButton icon="i-ph-folder-simple" color="neutral" variant="outline" size="xs" trailing-icon="i-ph-caret-down" :label="t('dms_media.search.in', { scope: scopeLabel })" />
			</UDropdownMenu>
			<UDropdownMenu :items="visibilityItems">
				<UButton icon="i-ph-globe" color="neutral" variant="outline" size="xs" trailing-icon="i-ph-caret-down" :label="t(`dms_media.search.visibility_${filters.visibility}`)" />
			</UDropdownMenu>
			<UDropdownMenu :items="modifiedItems">
				<UButton icon="i-ph-calendar-blank" color="neutral" variant="outline" size="xs" trailing-icon="i-ph-caret-down" :label="t(`dms_media.search.modified_${filters.modified}`)" />
			</UDropdownMenu>
		</div>
	</div>
</template>
