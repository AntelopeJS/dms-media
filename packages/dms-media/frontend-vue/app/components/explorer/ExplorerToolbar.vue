<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { ROOT_DROP_ID } from '../../composables/library/useExplorerDrop'
import { effectiveViewOf, hasColumns } from '../../composables/library/useExplorerLayout'
import type { ExplorerView } from '../../composables/useMediaPrefs'

const emit = defineEmits<{ toggleDetails: [] }>()
const { library, commands } = useExplorerContext()
const layout = useExplorerLayout()
const drop = useExplorerDrop()
const { t } = useI18n()
const { keyLabel } = useKeyboardPlatform()
const { prefs, update } = useMediaPrefs()
const searchInput = useTemplateRef<{ inputRef?: HTMLInputElement }>('search')
const query = ref('')
const SEARCH_DEBOUNCE_MS = 300

const location = computed(() => library.listing.location.value)
const crumbs = computed(() => {
	const chain = folderAncestors(library.currentFolder.value, library.tree.foldersById.value)
	const scopeIndex = chain.findIndex((folder) => folder.id === layout.scopeFolderId)
	return scopeIndex < 0 ? chain : chain.slice(scopeIndex)
})
const isScoped = computed(() => Boolean(layout.scopeFolderId))
const canCreateFolder = computed(() => {
	if (library.mode !== 'browse') return false
	const folder = library.currentFolder.value
	if (folder) return folder.rights.manage && folder.acceptsSubfolders
	return location.value.kind === 'root' && Boolean(library.tree.tree.value?.root.manage)
})
const canUpload = computed(() => {
	const folder = library.currentFolder.value
	if (folder) return folder.rights.write
	return library.tree.folders.value.some((entry) => entry.rights.write)
})
const viewItems = computed(() => [
	{ label: t('dms_media.views.grid'), value: 'grid', icon: 'i-ph-squares-four', disabled: false },
	{ label: t('dms_media.views.list'), value: 'list', icon: 'i-ph-list', disabled: false },
	{ label: t('dms_media.views.columns'), value: 'columns', icon: 'i-ph-columns', disabled: !hasColumns(location.value) },
])
const view = computed({
	get: () => effectiveViewOf(prefs.value.view, location.value),
	set: (value: ExplorerView) => update({ view: value }),
})
const navigation = computed(() => {
	const history = layout.history.value
	if (history) return history
	return {
		canGoBack: library.canGoBack.value,
		canGoForward: library.canGoForward.value,
		back: () => void library.back(),
		forward: () => void library.forward(),
	}
})
const isDetailsShown = computed(() =>
	layout.hasInlineDetails.value ? prefs.value.showDetails : layout.isDetailsDrawerOpen.value,
)
const isNarrow = computed(() => layout.width.value === 'narrow')
const isWide = computed(() => layout.width.value === 'wide')

watch(location, (next) => {
	if (next.kind !== 'search') query.value = ''
	else query.value = next.query
})

const runSearch = useDebounceFn((value: string) => {
	if (value.trim() !== query.value.trim()) return
	const scope = location.value.kind === 'search' ? location.value.scopeId : undefined
	void library.search(value, scope)
}, SEARCH_DEBOUNCE_MS)

function onQueryInput(value: string): void {
	query.value = value
	void runSearch(value)
}

const hasSearch = computed(() => Boolean(query.value) || location.value.kind === 'search')

async function clearQuery(): Promise<void> {
	if (!hasSearch.value) return
	query.value = ''
	await library.clearSearch()
}

/** Escape empties a search and stops there; with nothing typed, it is left to whatever holds the explorer, such as the picker. */
function onSearchEscape(event: KeyboardEvent): void {
	if (!hasSearch.value) return
	event.stopPropagation()
	void clearQuery()
}

function openStart(): void {
	void library.openFolder(layout.scopeFolderId ?? null)
}

defineShortcuts(buildSearchShortcuts(() => searchInput.value?.inputRef?.focus()))
defineExpose({ focusSearch: () => searchInput.value?.inputRef?.focus() })
</script>

<template>
	<div class="border-default flex flex-wrap items-center gap-2 border-b px-3 py-2">
		<UButton
			v-if="!layout.hasInlineSidebar.value"
			icon="i-ph-tree-structure"
			color="neutral"
			variant="ghost"
			size="sm"
			square
			:aria-label="t('dms_media.explorer.sidebar')"
			:aria-expanded="layout.isSidebarDrawerOpen.value"
			@click="layout.isSidebarDrawerOpen.value = true"
		/>
		<div class="flex items-center gap-0.5">
			<UButton
				icon="i-ph-arrow-left"
				color="neutral"
				variant="ghost"
				size="sm"
				square
				:disabled="!navigation.canGoBack"
				:aria-label="t('dms_media.actions.back')"
				@click="navigation.back()"
			/>
			<UButton
				icon="i-ph-arrow-right"
				color="neutral"
				variant="ghost"
				size="sm"
				square
				:disabled="!navigation.canGoForward"
				:aria-label="t('dms_media.actions.forward')"
				@click="navigation.forward()"
			/>
		</div>
		<nav class="flex min-w-0 flex-1 items-center gap-1 text-sm" :class="isNarrow && 'order-1 basis-full'" :aria-label="t('dms_media.explorer.location')">
			<button
				v-if="!isScoped"
				type="button"
				class="text-muted hover:text-highlighted flex shrink-0 items-center gap-1.5 rounded-sm px-1 py-0.5"
				:class="drop.hoverFolderId.value === ROOT_DROP_ID && 'ring-primary ring-2'"
				@click="openStart"
				@dragover="drop.onRootDragOver"
				@dragleave="drop.onRootDragLeave"
				@drop="drop.onRootDrop"
			>
				<UIcon name="i-ph-house" class="size-4" />
				<span :class="isNarrow && location.kind !== 'root' && 'sr-only'">{{ t('dms_media.library.root') }}</span>
			</button>
			<template v-if="location.kind === 'folder'">
				<template v-for="(crumb, index) in crumbs" :key="crumb.id">
					<UIcon v-if="index > 0 || !isScoped" name="i-ph-caret-right" class="text-dimmed size-3 shrink-0" />
					<button
						type="button"
						class="min-w-0 truncate rounded-sm px-1 py-0.5"
						:class="[
							index === crumbs.length - 1 ? 'text-highlighted font-semibold' : 'text-muted hover:text-highlighted',
							isNarrow && index < crumbs.length - 1 && 'max-w-24',
							drop.hoverFolderId.value === crumb.id && 'ring-primary ring-2',
						]"
						:aria-current="index === crumbs.length - 1 ? 'location' : undefined"
						@click="library.openFolder(crumb.id)"
						@dragover="drop.onFolderDragOver($event, crumb)"
						@dragleave="drop.onFolderDragLeave(crumb)"
						@drop="drop.onFolderDrop($event, crumb)"
					>
						{{ crumb.name }}
					</button>
				</template>
			</template>
			<template v-else-if="location.kind !== 'root'">
				<UIcon v-if="!isScoped" name="i-ph-caret-right" class="text-dimmed size-3 shrink-0" />
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
			:class="isWide ? 'w-64' : 'order-2 w-full'"
			:placeholder="t('dms_media.search.placeholder')"
			:aria-label="t('dms_media.search.placeholder')"
			@update:model-value="onQueryInput(String($event))"
			@keydown.escape="onSearchEscape"
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
				<span v-else class="hidden items-center gap-0.5 sm:inline-flex [@media(pointer:coarse)]:hidden">
					<UKbd :value="keyLabel('meta')" size="sm" />
					<UKbd value="/" size="sm" />
				</span>
			</template>
		</UInput>
		<div class="border-default flex items-center rounded-md border p-0.5" role="radiogroup" :aria-label="t('dms_media.views.label')">
			<UTooltip v-for="(item, index) in viewItems" :key="item.value" :text="item.label" :kbds="[String(index + 1)]">
				<UButton
					:icon="item.icon"
					color="neutral"
					:variant="view === item.value ? 'soft' : 'ghost'"
					size="xs"
					square
					role="radio"
					:disabled="item.disabled"
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
				:variant="isDetailsShown ? 'soft' : 'ghost'"
				size="sm"
				square
				:aria-pressed="isDetailsShown"
				:aria-label="t('dms_media.explorer.toggle_details')"
				@click="emit('toggleDetails')"
			/>
		</UTooltip>
		<UButton
			v-if="canCreateFolder"
			icon="i-ph-folder-plus"
			color="neutral"
			variant="outline"
			size="sm"
			:square="isNarrow"
			:label="isNarrow ? undefined : t('dms_media.actions.new_folder')"
			:aria-label="t('dms_media.actions.new_folder')"
			@click="commands.newFolder()"
		/>
		<UButton
			v-if="library.mode === 'browse' && canUpload"
			icon="i-ph-upload-simple"
			size="sm"
			:label="t('dms_media.actions.upload')"
			@click="commands.upload()"
		>
			<template v-if="!isNarrow" #trailing>
				<UKbd value="U" size="sm" variant="subtle" />
			</template>
		</UButton>
	</div>
</template>
