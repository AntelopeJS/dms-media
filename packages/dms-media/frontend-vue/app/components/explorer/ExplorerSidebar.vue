<script setup lang="ts">
import type { SmartView } from '../../types/media'
import FolderTreeNode from './FolderTreeNode.vue'

const { library, commands } = useExplorerContext()
const { t } = useI18n()
const format = useMediaFormat()
const expanded = ref<Set<string>>(new Set())

const location = computed(() => library.listing.location.value)
const activeId = computed(() =>
	location.value.kind === 'folder' ? location.value.folderId : undefined,
)
const roots = computed(() => library.tree.childrenOf(null))
const tree = computed(() => library.tree.tree.value)
const canCreateAtRoot = computed(
	() => library.mode === 'browse' && Boolean(tree.value?.root.manage),
)

interface SmartViewEntry {
	view: SmartView
	icon: string
	count?: number
	tone?: 'warning'
}

const views = computed<SmartViewEntry[]>(() => [
	{ view: 'recent', icon: 'i-ph-clock-counter-clockwise' },
	{ view: 'starred', icon: 'i-ph-star', count: tree.value?.views.starred },
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
				</li>
			</ul>
			<div class="mt-4 mb-1 flex items-center justify-between px-2.5">
				<DmsEyebrow :label="t('dms_media.explorer.locations')" tone="muted" />
				<UTooltip v-if="canCreateAtRoot" :text="t('dms_media.actions.new_folder_root')">
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
			<ul role="tree" :aria-label="t('dms_media.explorer.locations')">
				<li>
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded-md py-1.5 ps-1 pe-2 text-[13px]"
						:class="location.kind === 'root' ? 'bg-(--dms-accent-tint) text-highlighted font-medium' : 'text-default hover:bg-(--dms-bg-muted)'"
						@click="library.openFolder(null)"
					>
						<span class="w-5" />
						<UIcon name="i-ph-house" class="text-muted size-4" />
						<span class="flex-1 text-start">{{ t('dms_media.library.root') }}</span>
						<span class="text-dimmed font-mono text-[11px]">
							{{ format.formatNumber(tree?.root.fileCount ?? 0) }}
						</span>
					</button>
				</li>
				<FolderTreeNode
					v-for="folder in roots"
					:key="folder.id"
					:folder="folder"
					:depth="1"
					:expanded="expanded"
					:active-id="activeId"
					@toggle="toggle"
				/>
			</ul>
			<p v-if="tree && roots.length === 0" class="text-muted px-2.5 py-2 text-[13px]">
				{{ t('dms_media.explorer.no_folders') }}
			</p>
		</div>
		<div v-if="tree" class="border-default border-t p-3">
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
				{{ t('dms_media.explorer.storage_files', { count: format.formatNumber(tree.root.fileCount) }) }}
			</p>
		</div>
	</aside>
</template>
