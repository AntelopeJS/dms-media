<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { MediaFolder } from '../../types/media'
import VisibilityBadge from '../shared/VisibilityBadge.vue'

const { library, commands } = useExplorerContext()
const { t } = useI18n()
const format = useMediaFormat()
const menus = useListingFilterItems(library)

const location = computed(() => library.listing.location.value)
const folder = computed(() => library.currentFolder.value)
const filters = computed(() => library.listing.filters.value)
const facets = computed(() => library.listing.facets.value)
const subfolderCount = computed(() => library.visibleFolders.value.length)
const scopeFolder = computed(() => library.tree.scopeFolder.value)
const isTypeLocked = computed(() => Boolean(library.acceptedTypesLabel.value))
/** The counts are not known yet: the tree, or the first page of a view or a search, is still loading. */
const isSummaryPending = computed(() => {
	const current = location.value
	if (!library.tree.tree.value) return true
	if (current.kind === 'folder') return !folder.value
	const listing = library.listing
	return (current.kind === 'view' || current.kind === 'search') && listing.isLoading.value && listing.assets.value.length === 0
})

const title = computed(() => {
	const current = location.value
	if (current.kind === 'folder') return folder.value?.name ?? ''
	if (current.kind === 'view') return t(`dms_media.smart_views.${current.view}`)
	if (current.kind === 'search') return t('dms_media.search.results_for', { query: current.query })
	return t('dms_media.library.root')
})

/** Files and bytes stored in the folder itself, its subfolders' share taken out. */
function directContent(current: MediaFolder): { files: number; size: number } {
	const children = library.tree.childrenOf(current.id)
	return {
		files: Math.max(current.fileCount - children.reduce((sum, child) => sum + child.fileCount, 0), 0),
		size: Math.max(current.size - children.reduce((sum, child) => sum + child.size, 0), 0),
	}
}

function fileCountLabel(count: number): string {
	return t('dms_media.explorer.file_count', { count }, count)
}

const summary = computed(() => {
	const current = location.value
	const parts: string[] = []
	if (current.kind === 'folder' || current.kind === 'root')
		parts.push(t('dms_media.explorer.folder_count', { count: subfolderCount.value }, subfolderCount.value))
	if (current.kind === 'view' || current.kind === 'search') parts.push(fileCountLabel(library.listing.total.value))
	if (!folder.value || folder.value.shell) return parts.join(' · ')
	const direct = directContent(folder.value)
	parts.push(fileCountLabel(direct.files), t('dms_media.explorer.size_here', { size: format.formatBytes(direct.size) }))
	return parts.join(' · ')
})

const subtreeSummary = computed(() => {
	const current = folder.value
	if (!current || current.shell || current.fileCount === directContent(current).files) return ''
	return t('dms_media.explorer.with_subfolders', { count: current.fileCount, size: format.formatBytes(current.size) }, current.fileCount)
})

function pageTitleOf(current: MediaFolder): string | undefined {
	const pageTitle = current.link?.pageTitle
	if (!pageTitle) return undefined
	return pageTitle.startsWith('$') ? t(pageTitle.slice(1)) : pageTitle
}

const linkLabel = computed(() => {
	const current = folder.value
	if (!current?.bound) return ''
	if (current.link?.isContentRoot) return t('dms_media.markers.content_root')
	const page = pageTitleOf(current)
	return page ? t('dms_media.markers.linked_page', { page }) : t('dms_media.markers.linked')
})

const linkTarget = computed(() => (library.mode === 'browse' ? folder.value?.link?.pageUrl ?? undefined : undefined))

const canChangeVisibility = computed(() =>
	Boolean(folder.value && commands.canChangeFolderVisibility?.(folder.value)),
)

function changeVisibility(): void {
	if (folder.value && canChangeVisibility.value) void commands.changeFolderVisibility?.(folder.value)
}

const scopeItems = computed<DropdownMenuItem[]>(() => {
	const current = location.value
	if (current.kind !== 'search') return []
	const origin = library.lastFolderId.value
		? library.tree.foldersById.value.get(library.lastFolderId.value)
		: undefined
	const base = scopeFolder.value
	const isBaseChecked = !current.scopeId || current.scopeId === base?.id
	return [
		{
			label: base?.name ?? t('dms_media.search.scope_all'),
			icon: base ? 'i-ph-folder-simple' : undefined,
			type: 'checkbox',
			checked: isBaseChecked,
			onSelect: () => void library.search(current.query),
		},
		...(origin && origin.id !== base?.id
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
	if (current.kind !== 'search') return ''
	if (!current.scopeId) return scopeFolder.value?.name ?? t('dms_media.search.scope_all')
	return library.tree.foldersById.value.get(current.scopeId)?.name ?? t('dms_media.search.scope_missing')
})

const facetLabel = computed(() =>
	menus.activeFacetCount.value
		? t('dms_media.filters.active', { count: menus.activeFacetCount.value })
		: t('dms_media.filters.label'),
)
</script>

<template>
	<div class="border-default flex flex-col gap-2 border-b px-4 py-3">
		<div class="flex flex-wrap items-start gap-3">
			<div class="min-w-0 flex-1 basis-60">
				<USkeleton v-if="isSummaryPending && !title" class="h-6 w-40" />
				<h2 v-else class="text-highlighted truncate text-lg font-semibold tracking-tight">{{ title }}</h2>
				<div class="text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
					<USkeleton v-if="isSummaryPending" class="h-3.5 w-44" :aria-label="t('dms_media.explorer.loading_counts')" />
					<span v-else class="font-mono text-xs">{{ summary }}</span>
					<UTooltip v-if="subtreeSummary" :text="t('dms_media.explorer.with_subfolders_hint')">
						<span class="text-dimmed font-mono text-xs">({{ subtreeSummary }})</span>
					</UTooltip>
					<template v-if="folder">
						<UTooltip :text="t('dms_media.actions.visibility')" :disabled="!canChangeVisibility">
							<VisibilityBadge
								:visibility="folder.visibility"
								:as="canChangeVisibility ? 'button' : 'span'"
								:type="canChangeVisibility ? 'button' : undefined"
								:trailing-icon="canChangeVisibility ? 'i-ph-caret-down' : undefined"
								:class="canChangeVisibility ? 'cursor-pointer hover:opacity-80' : undefined"
								size="sm"
								@click="changeVisibility"
							/>
						</UTooltip>
						<UBadge v-if="folder.hasOwnAcl && !folder.bound" :label="t('dms_media.markers.own_rules')" icon="i-ph-shield-check" color="warning" variant="subtle" size="sm" />
						<UTooltip v-if="folder.bound" :text="t('dms_media.markers.binding_id', { binding: folder.binding })">
							<ULink v-if="linkTarget" :to="linkTarget">
								<UBadge :label="linkLabel" icon="i-ph-link-simple" trailing-icon="i-ph-arrow-up-right" color="primary" variant="subtle" size="sm" />
							</ULink>
							<UBadge v-else :label="linkLabel" icon="i-ph-link-simple" color="primary" variant="subtle" size="sm" />
						</UTooltip>
						<UBadge v-if="folder.shell" :label="t('dms_media.markers.limited_access')" icon="i-ph-lock-simple" color="neutral" variant="outline" size="sm" />
						<UBadge v-else-if="!folder.rights.write" :label="t('dms_media.markers.read_only')" icon="i-ph-eye" color="neutral" variant="outline" size="sm" />
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
			<div v-if="location.kind !== 'root' && !folder?.shell" class="flex flex-wrap items-center gap-2">
				<template v-if="location.kind !== 'search'">
					<UBadge
						v-if="isTypeLocked"
						icon="i-ph-funnel"
						:label="t('dms_media.types.accepted', { types: library.acceptedTypesLabel.value })"
						color="neutral"
						variant="outline"
					/>
					<UDropdownMenu v-else-if="menus.typeEntries.value.length > 0" :items="menus.typeItems.value">
						<UButton
							icon="i-ph-funnel"
							color="neutral"
							variant="outline"
							size="sm"
							trailing-icon="i-ph-caret-down"
							:label="filters.type ? t(`dms_media.types.${filters.type}`) : t('dms_media.types.all')"
						/>
					</UDropdownMenu>
					<UDropdownMenu :items="menus.facetItems.value">
						<UButton
							icon="i-ph-sliders-horizontal"
							:color="menus.activeFacetCount.value ? 'primary' : 'neutral'"
							:variant="menus.activeFacetCount.value ? 'soft' : 'outline'"
							size="sm"
							trailing-icon="i-ph-caret-down"
							:label="facetLabel"
						/>
					</UDropdownMenu>
				</template>
				<UDropdownMenu :items="menus.sortItems.value">
					<UButton
						:icon="filters.direction === 'asc' ? 'i-ph-sort-ascending' : 'i-ph-sort-descending'"
						color="neutral"
						variant="outline"
						size="sm"
						trailing-icon="i-ph-caret-down"
						:label="t(`dms_media.sort.${filters.sort}`)"
					/>
				</UDropdownMenu>
			</div>
		</div>
		<div v-if="location.kind === 'search'" class="flex flex-wrap items-center gap-1.5">
			<UBadge
				v-if="isTypeLocked"
				icon="i-ph-funnel"
				:label="t('dms_media.types.accepted', { types: library.acceptedTypesLabel.value })"
				color="neutral"
				variant="outline"
			/>
			<template v-else>
				<UButton
					:label="t('dms_media.types.all')"
					size="xs"
					:color="!filters.type ? 'primary' : 'neutral'"
					:variant="!filters.type ? 'soft' : 'outline'"
					@click="menus.setType(undefined)"
				>
					<template #trailing>
						<span class="font-mono text-[11px]">{{ facets.all ?? 0 }}</span>
					</template>
				</UButton>
				<UButton
					v-for="entry in menus.typeEntries.value"
					:key="entry.group"
					:icon="TYPE_GROUP_ICONS[entry.group]"
					:label="t(`dms_media.types.${entry.group}`)"
					size="xs"
					:color="filters.type === entry.group ? 'primary' : 'neutral'"
					:variant="filters.type === entry.group ? 'soft' : 'outline'"
					@click="menus.setType(entry.group)"
				>
					<template #trailing>
						<span class="font-mono text-[11px]">{{ entry.count }}</span>
					</template>
				</UButton>
			</template>
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
			<UDropdownMenu v-for="filter in (['visibility', 'modified', 'orientation'] as const)" :key="filter" :items="menus.choiceItems(filter)">
				<UButton :icon="menus.filterIcons[filter]" color="neutral" variant="outline" size="xs" trailing-icon="i-ph-caret-down" :label="menus.choiceLabel(filter)" />
			</UDropdownMenu>
		</div>
	</div>
</template>
