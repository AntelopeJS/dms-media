<script setup lang="ts">
import type { MediaFolder } from '../../types/media'
import FolderGlyph from '../shared/FolderGlyph.vue'
import FolderMarkers from '../shared/FolderMarkers.vue'

const props = defineProps<{ folders: MediaFolder[]; selectedId?: string }>()
const emit = defineEmits<{ select: [string] }>()
const { t } = useI18n()
const format = useMediaFormat()
const filter = ref('')
const collapsed = ref<Set<string>>(new Set())

interface Row {
	folder: MediaFolder
	depth: number
	hasChildren: boolean
}

const byParent = computed(() => {
	const ids = new Set(props.folders.map((folder) => folder.id))
	const map = new Map<string | null, MediaFolder[]>()
	for (const folder of props.folders) {
		const key = folder.parentId && ids.has(folder.parentId) ? folder.parentId : null
		map.set(key, [...(map.get(key) ?? []), folder])
	}
	for (const [key, list] of map) map.set(key, [...list].sort((left, right) => left.name.localeCompare(right.name)))
	return map
})

const rows = computed(() => {
	const result: Row[] = []
	const needle = filter.value.trim().toLowerCase()
	const visit = (parentId: string | null, depth: number) => {
		for (const folder of byParent.value.get(parentId) ?? []) {
			const children = byParent.value.get(folder.id) ?? []
			result.push({ folder, depth, hasChildren: children.length > 0 })
			if (needle || !collapsed.value.has(folder.id)) visit(folder.id, depth + 1)
		}
	}
	visit(null, 0)
	return needle ? result.filter((row) => row.folder.name.toLowerCase().includes(needle)) : result
})

function toggle(folderId: string): void {
	const next = new Set(collapsed.value)
	if (next.has(folderId)) next.delete(folderId)
	else next.add(folderId)
	collapsed.value = next
}
</script>

<template>
	<DmsCard :title="t('dms_media.access.folders')" class="flex min-h-0 flex-col">
		<template #actions>
			<UInput v-model="filter" size="xs" icon="i-ph-magnifying-glass" :placeholder="t('dms_media.dialogs.find_folder')" class="w-40" />
		</template>
		<ul class="-mx-2 flex max-h-[560px] flex-col overflow-y-auto" role="tree">
			<li
				v-for="row in rows"
				:key="row.folder.id"
				role="treeitem"
				:aria-selected="row.folder.id === selectedId"
				class="flex items-center gap-1 rounded-md pe-2 text-[13px]"
				:class="row.folder.id === selectedId ? 'bg-(--dms-accent-tint) text-highlighted font-medium' : 'hover:bg-(--dms-bg-muted)'"
				:style="{ paddingInlineStart: `${row.depth * 14 + 2}px` }"
			>
				<button
					v-if="row.hasChildren && !filter"
					type="button"
					class="text-dimmed flex size-5 items-center justify-center"
					:aria-label="collapsed.has(row.folder.id) ? t('dms_media.actions.expand') : t('dms_media.actions.collapse')"
					@click="toggle(row.folder.id)"
				>
					<UIcon :name="collapsed.has(row.folder.id) ? 'i-ph-caret-right' : 'i-ph-caret-down'" class="size-3" />
				</button>
				<span v-else class="w-5" />
				<button type="button" class="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-start" @click="emit('select', row.folder.id)">
					<FolderGlyph :folder="row.folder" />
					<span class="truncate" :class="row.folder.shell && 'text-muted'">{{ row.folder.name }}</span>
					<FolderMarkers :folder="row.folder" />
				</button>
				<span v-if="!row.folder.shell" class="text-dimmed font-mono text-[11px]">{{ format.formatNumber(row.folder.fileCount) }}</span>
			</li>
		</ul>
		<template #footer>
			<div class="text-dimmed flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
				<span class="flex items-center gap-1"><UIcon name="i-ph-globe" class="text-success size-3" />{{ t('dms_media.markers.public') }}</span>
				<span class="flex items-center gap-1"><UIcon name="i-ph-lock-simple" class="text-warning size-3" />{{ t('dms_media.markers.own_rules') }}</span>
				<span class="flex items-center gap-1"><UIcon name="i-ph-link-simple" class="text-primary size-3" />{{ t('dms_media.markers.linked') }}</span>
				<span class="flex items-center gap-1"><UIcon name="i-ph-eye-slash" class="size-3" />{{ t('dms_media.access.legend_shell') }}</span>
			</div>
		</template>
	</DmsCard>
</template>
