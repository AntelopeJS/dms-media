<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { ExplorerView } from '../../composables/useMediaPrefs'

const { library, commands } = useExplorerContext()
const { t } = useI18n()
const { prefs, update } = useMediaPrefs()
const searchInput = useTemplateRef<{ inputRef?: HTMLInputElement }>('search')
const query = ref('')
const SEARCH_DEBOUNCE_MS = 300

const location = computed(() => library.listing.location.value)
const crumbs = computed(() =>
	folderAncestors(library.currentFolder.value, library.tree.foldersById.value),
)
const canCreateFolder = computed(() => {
	if (library.mode !== 'browse') return false
	const folder = library.currentFolder.value
	if (folder) return folder.rights.manage && !folder.bound
	return location.value.kind === 'root' && Boolean(library.tree.tree.value?.root.manage)
})
const canUpload = computed(() => {
	const folder = library.currentFolder.value
	if (folder) return folder.rights.write
	return library.tree.folders.value.some((entry) => entry.rights.write)
})
const viewItems = computed(() => [
	{ label: t('dms_media.views.grid'), value: 'grid', icon: 'i-ph-squares-four' },
	{ label: t('dms_media.views.list'), value: 'list', icon: 'i-ph-list' },
	{ label: t('dms_media.views.columns'), value: 'columns', icon: 'i-ph-columns' },
])
const view = computed({
	get: () => prefs.value.view,
	set: (value: ExplorerView) => update({ view: value }),
})

watch(location, (next) => {
	if (next.kind !== 'search') query.value = ''
	else query.value = next.query
})

const runSearch = useDebounceFn((value: string) => {
	const scope = location.value.kind === 'search' ? location.value.scopeId : undefined
	void library.search(value, scope)
}, SEARCH_DEBOUNCE_MS)

function onQueryInput(value: string): void {
	query.value = value
	void runSearch(value)
}

function clearQuery(): void {
	query.value = ''
	void library.clearSearch()
}

defineShortcuts(buildSearchShortcuts(() => searchInput.value?.inputRef?.focus()))
defineExpose({ focusSearch: () => searchInput.value?.inputRef?.focus() })
</script>

<template>
	<div class="border-default flex flex-wrap items-center gap-2 border-b px-3 py-2">
		<div class="flex items-center gap-0.5">
			<UButton
				icon="i-ph-arrow-left"
				color="neutral"
				variant="ghost"
				size="sm"
				square
				:disabled="!library.canGoBack.value"
				:aria-label="t('dms_media.actions.back')"
				@click="library.back()"
			/>
			<UButton
				icon="i-ph-arrow-right"
				color="neutral"
				variant="ghost"
				size="sm"
				square
				:disabled="!library.canGoForward.value"
				:aria-label="t('dms_media.actions.forward')"
				@click="library.forward()"
			/>
		</div>
		<nav class="flex min-w-0 flex-1 items-center gap-1 text-sm" :aria-label="t('dms_media.explorer.location')">
			<button
				type="button"
				class="text-muted hover:text-highlighted flex shrink-0 items-center gap-1.5 rounded-sm px-1 py-0.5"
				@click="library.openFolder(null)"
			>
				<UIcon name="i-ph-house" class="size-4" />
				<span>{{ t('dms_media.library.root') }}</span>
			</button>
			<template v-if="location.kind === 'folder'">
				<template v-for="(crumb, index) in crumbs" :key="crumb.id">
					<UIcon name="i-ph-caret-right" class="text-dimmed size-3 shrink-0" />
					<button
						type="button"
						class="truncate rounded-sm px-1 py-0.5"
						:class="index === crumbs.length - 1 ? 'text-highlighted font-semibold' : 'text-muted hover:text-highlighted'"
						@click="library.openFolder(crumb.id)"
					>
						{{ crumb.name }}
					</button>
				</template>
			</template>
			<template v-else-if="location.kind !== 'root'">
				<UIcon name="i-ph-caret-right" class="text-dimmed size-3 shrink-0" />
				<span class="text-highlighted truncate px-1 font-semibold">
					{{ location.kind === 'view' ? t(`dms_media.smart_views.${location.view}`) : t('dms_media.search.crumb') }}
				</span>
			</template>
		</nav>
		<UInput
			ref="search"
			:model-value="query"
			icon="i-ph-magnifying-glass"
			size="sm"
			class="w-full sm:w-64"
			:placeholder="t('dms_media.search.placeholder')"
			:aria-label="t('dms_media.search.placeholder')"
			@update:model-value="onQueryInput(String($event))"
			@keydown.escape="clearQuery"
		>
			<template #trailing>
				<UButton
					v-if="query"
					icon="i-ph-x"
					color="neutral"
					variant="link"
					size="xs"
					:aria-label="t('dms_media.search.clear')"
					@click="clearQuery"
				/>
				<template v-else>
					<UKbd value="meta" size="sm" />
					<UKbd value="/" size="sm" />
				</template>
			</template>
		</UInput>
		<div class="border-default flex items-center rounded-md border p-0.5 max-sm:hidden" role="radiogroup" :aria-label="t('dms_media.views.label')">
			<UTooltip v-for="(item, index) in viewItems" :key="item.value" :text="item.label" :kbds="[String(index + 1)]">
				<UButton
					:icon="item.icon"
					color="neutral"
					:variant="view === item.value ? 'soft' : 'ghost'"
					size="xs"
					square
					role="radio"
					:aria-checked="view === item.value"
					:aria-label="item.label"
					@click="view = item.value as ExplorerView"
				/>
			</UTooltip>
		</div>
		<UTooltip :text="t('dms_media.explorer.toggle_details')" :kbds="['i']">
			<UButton
				icon="i-ph-sidebar-simple"
				color="neutral"
				:variant="prefs.showDetails ? 'soft' : 'ghost'"
				size="sm"
				square
				class="max-lg:hidden"
				:aria-pressed="prefs.showDetails"
				:aria-label="t('dms_media.explorer.toggle_details')"
				@click="update({ showDetails: !prefs.showDetails })"
			/>
		</UTooltip>
		<UButton
			v-if="canCreateFolder"
			icon="i-ph-folder-plus"
			color="neutral"
			variant="outline"
			size="sm"
			:label="t('dms_media.actions.new_folder')"
			@click="commands.newFolder()"
		/>
		<UButton
			v-if="library.mode === 'browse' && canUpload"
			icon="i-ph-upload-simple"
			size="sm"
			:label="t('dms_media.actions.upload')"
			@click="commands.upload()"
		>
			<template #trailing>
				<UKbd value="U" size="sm" variant="subtle" />
			</template>
		</UButton>
	</div>
</template>
