<script setup lang="ts">
import { ROOT_DROP_ID } from '../../composables/library/useExplorerDrop'
import type { MediaFolder, SmartView } from '../../types/media'
import FolderGlyph from '../shared/FolderGlyph.vue'
import FolderTreeNode from './FolderTreeNode.vue'

const { library, commands } = useExplorerContext()
const layout = useExplorerLayout()
const drop = useExplorerDrop()
const { t } = useI18n()
const format = useMediaFormat()
const expanded = ref<Set<string>>(new Set())
const focusedId = ref<string | null>(null)
const TREE_ITEM = '[role="treeitem"]'

const location = computed(() => library.listing.location.value)
const activeId = computed(() =>
	location.value.kind === 'folder' ? location.value.folderId : undefined,
)
const scopeFolder = computed(() =>
	layout.scopeFolderId ? library.tree.foldersById.value.get(layout.scopeFolderId) : undefined,
)
const roots = computed(() => (layout.scopeFolderId ? [scopeFolder.value].filter((folder): folder is MediaFolder => Boolean(folder)) : library.tree.childrenOf(null)))
const tree = computed(() => library.tree.tree.value)
const canCreateAtRoot = computed(
	() => library.mode === 'browse' && Boolean(tree.value?.root.manage),
)
const starredFolders = computed(() => library.tree.folders.value.filter((folder) => folder.starred))
const tabStopId = computed(() => focusedId.value ?? activeId.value ?? (layout.scopeFolderId ? roots.value[0]?.id : ROOT_DROP_ID))

interface SmartViewEntry {
	view: SmartView
	icon: string
	count?: number
	tone?: 'warning'
}

const views = computed<SmartViewEntry[]>(() => [
	{ view: 'recent', icon: 'i-ph-clock-counter-clockwise' },
	{ view: 'starred', icon: 'i-ph-star', count: tree.value?.views.starred },
	{ view: 'largest', icon: 'i-ph-arrows-out-simple' },
	{ view: 'public', icon: 'i-ph-globe-simple' },
	{
		view: 'missing-alt',
		icon: 'i-ph-text-aa',
		count: tree.value?.views.missingAlt,
		tone: tree.value?.views.missingAlt ? 'warning' : undefined,
	},
])

function toggle(folderId: string): void {
	const next = new Set(expanded.value)
	if (next.has(folderId)) next.delete(folderId)
	else next.add(folderId)
	expanded.value = next
}

watch(
	() => library.currentFolder.value,
	(folder) => {
		const ancestors = folderAncestors(folder, library.tree.foldersById.value)
		const next = new Set(expanded.value)
		ancestors.slice(0, -1).forEach((entry) => next.add(entry.id))
		if (folder) next.add(folder.id)
		expanded.value = next
	},
	{ immediate: true },
)

function isViewActive(view: SmartView): boolean {
	return location.value.kind === 'view' && location.value.view === view
}

function openTreeItem(id: string): void {
	void library.openFolder(id === ROOT_DROP_ID ? null : id)
}

interface TreeKeyContext {
	items: HTMLElement[]
	index: number
	current: HTMLElement
	id: string
}

function focusItem(item: Element | null | undefined): void {
	if (item instanceof HTMLElement) focusInView(item)
}

/** WAI-ARIA tree keys: ↑ ↓ move, → opens or goes in, ← closes or goes up, Enter opens the folder. */
const TREE_KEYS: Record<string, (context: TreeKeyContext) => void> = {
	ArrowDown: ({ items, index }) => focusItem(items[index + 1]),
	ArrowUp: ({ items, index }) => focusItem(items[index - 1]),
	Home: ({ items }) => focusItem(items[0]),
	End: ({ items }) => focusItem(items.at(-1)),
	ArrowRight: ({ items, index, current, id }) => {
		const state = current.getAttribute('aria-expanded')
		if (state === 'false') toggle(id)
		if (state === 'true') focusItem(items[index + 1])
	},
	ArrowLeft: ({ current, id }) => {
		if (current.getAttribute('aria-expanded') === 'true') return toggle(id)
		focusItem(current.parentElement?.closest(TREE_ITEM))
	},
	Enter: ({ id }) => openTreeItem(id),
	' ': ({ id }) => openTreeItem(id),
}

function onTreeKeydown(event: KeyboardEvent): void {
	const handle = TREE_KEYS[event.key]
	const current = (event.target as HTMLElement).closest<HTMLElement>(TREE_ITEM)
	if (!handle || !current?.dataset.treeId || event.altKey || event.metaKey || event.ctrlKey) return
	event.preventDefault()
	event.stopPropagation()
	const items = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(TREE_ITEM))
	handle({ items, index: items.indexOf(current), current, id: current.dataset.treeId })
}

function onTreeFocus(event: FocusEvent): void {
	const id = (event.target as HTMLElement).closest<HTMLElement>(TREE_ITEM)?.dataset.treeId
	if (id) focusedId.value = id
}
</script>

<template>
	<aside class="flex min-h-0 flex-col" :aria-label="t('dms_media.explorer.sidebar')">
		<div class="min-h-0 flex-1 overflow-y-auto px-2 py-3">
			<ul class="flex flex-col gap-0.5">
				<li v-for="entry in views" :key="entry.view">
					<button
						type="button"
						class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px]"
						:class="isViewActive(entry.view) ? 'bg-(--dms-accent-tint) text-highlighted font-medium' : 'text-default hover:bg-(--dms-bg-muted)'"
						:aria-current="isViewActive(entry.view) ? 'page' : undefined"
						@click="library.open({ kind: 'view', view: entry.view })"
					>
						<UIcon :name="entry.icon" class="text-muted size-4" />
						<span class="flex-1 text-start">{{ t(`dms_media.smart_views.${entry.view}`) }}</span>
						<UBadge
							v-if="entry.count"
							:label="format.formatNumber(entry.count)"
							:color="entry.tone ?? 'neutral'"
							variant="subtle"
							size="sm"
							class="font-mono"
						/>
					</button>
					<ul v-if="entry.view === 'starred' && starredFolders.length" class="mt-0.5 flex flex-col gap-0.5" :aria-label="t('dms_media.explorer.starred_folders')">
						<li v-for="folder in starredFolders" :key="folder.id">
							<button
								type="button"
								class="flex w-full items-center gap-2 rounded-md py-1 ps-8 pe-2.5 text-[13px]"
								:class="activeId === folder.id ? 'bg-(--dms-accent-tint) text-highlighted font-medium' : 'text-default hover:bg-(--dms-bg-muted)'"
								@click="library.openFolder(folder.id)"
							>
								<FolderGlyph :folder="folder" />
								<span class="min-w-0 flex-1 truncate text-start">{{ folder.name }}</span>
							</button>
						</li>
					</ul>
				</li>
			</ul>
			<div class="mt-4 mb-1 flex items-center justify-between px-2.5">
				<DmsEyebrow :label="t('dms_media.explorer.locations')" tone="muted" />
				<UTooltip v-if="canCreateAtRoot && !layout.scopeFolderId" :text="t('dms_media.actions.new_folder_root')">
					<UButton
						icon="i-ph-folder-plus"
						color="neutral"
						variant="ghost"
						size="xs"
						square
						:aria-label="t('dms_media.actions.new_folder_root')"
						@click="commands.newFolder(null)"
					/>
				</UTooltip>
			</div>
			<ul role="tree" :aria-label="t('dms_media.explorer.locations')" @keydown="onTreeKeydown" @focusin="onTreeFocus">
				<li
					v-if="!layout.scopeFolderId"
					role="treeitem"
					aria-level="1"
					:aria-label="t('dms_media.library.root')"
					:aria-selected="location.kind === 'root'"
					:tabindex="tabStopId === ROOT_DROP_ID ? 0 : -1"
					:data-tree-id="ROOT_DROP_ID"
					class="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-(--ui-primary) focus-visible:ring-inset"
					@click="library.openFolder(null)"
					@dragover="drop.onRootDragOver"
					@dragleave="drop.onRootDragLeave"
					@drop="drop.onRootDrop"
				>
					<div
						class="flex w-full cursor-pointer items-center gap-2 rounded-md py-1.5 ps-1 pe-2 text-[13px]"
						:class="[
							location.kind === 'root' ? 'bg-(--dms-accent-tint) text-highlighted font-medium' : 'text-default hover:bg-(--dms-bg-muted)',
							drop.hoverFolderId.value === ROOT_DROP_ID && 'ring-primary ring-2 ring-inset',
						]"
					>
						<span class="w-5" />
						<UIcon name="i-ph-house" class="text-muted size-4" />
						<span class="flex-1 text-start">{{ t('dms_media.library.root') }}</span>
						<span class="text-dimmed font-mono text-xs">
							{{ format.formatNumber(tree?.root.fileCount ?? 0) }}
						</span>
					</div>
				</li>
				<FolderTreeNode
					v-for="folder in roots"
					:key="folder.id"
					:folder="folder"
					:depth="1"
					:expanded="expanded"
					:active-id="activeId"
					:tab-stop-id="tabStopId"
					@toggle="toggle"
				/>
			</ul>
			<p v-if="tree && roots.length === 0" class="text-muted px-2.5 py-2 text-[13px]">
				{{ t('dms_media.explorer.no_folders') }}
			</p>
		</div>
		<div v-if="tree && !layout.scopeFolderId" class="border-default border-t p-3">
			<DmsMeter
				v-if="tree.quotaBytes"
				:label="t('dms_media.explorer.storage')"
				:value="tree.root.size"
				:max="tree.quotaBytes"
				:value-label="format.formatBytes(tree.root.size)"
				:hint="t('dms_media.explorer.storage_quota', { quota: format.formatBytes(tree.quotaBytes) })"
				:warn-at="80"
				:error-at="95"
				size="xs"
			/>
			<div v-else class="flex items-baseline justify-between gap-2 text-[13px]">
				<span class="text-muted">{{ t('dms_media.explorer.storage') }}</span>
				<span class="text-highlighted font-mono">{{ format.formatBytes(tree.root.size) }}</span>
			</div>
			<p v-if="!tree.quotaBytes" class="text-dimmed mt-0.5 text-[12px]">
				{{ t('dms_media.explorer.storage_files', { count: format.formatNumber(tree.root.fileCount) }, tree.root.fileCount) }}
			</p>
		</div>
	</aside>
</template>
