<script setup lang="ts">
import FolderGlyph from './FolderGlyph.vue'
import FolderMarkers from './FolderMarkers.vue'
import type { MediaFolder } from '../../types/media'

const props = defineProps<{
	folders: MediaFolder[]
	isAllowed: (folder: MediaFolder) => string | undefined
	allowRoot?: boolean
	rootLabel?: string
}>()
const selected = defineModel<string | null | undefined>()
const filter = ref('')
const expanded = ref<Set<string>>(new Set())
const { t } = useI18n()

const byParent = computed(() => {
	const map = new Map<string | null, MediaFolder[]>()
	const ids = new Set(props.folders.map((folder) => folder.id))
	for (const folder of props.folders) {
		const key = folder.parentId && ids.has(folder.parentId) ? folder.parentId : null
		map.set(key, [...(map.get(key) ?? []), folder])
	}
	for (const [key, list] of map)
		map.set(key, [...list].sort((left, right) => left.name.localeCompare(right.name)))
	return map
})

interface Row {
	folder: MediaFolder
	depth: number
	hasChildren: boolean
	disabledReason?: string
}

function collect(parentId: string | null, depth: number, rows: Row[]): void {
	for (const folder of byParent.value.get(parentId) ?? []) {
		const children = byParent.value.get(folder.id) ?? []
		rows.push({
			folder,
			depth,
			hasChildren: children.length > 0,
			disabledReason: props.isAllowed(folder),
		})
		if (expanded.value.has(folder.id) || filter.value) collect(folder.id, depth + 1, rows)
	}
}

const rows = computed(() => {
	const all: Row[] = []
	collect(null, 0, all)
	const needle = filter.value.trim().toLowerCase()
	return needle ? all.filter((row) => row.folder.name.toLowerCase().includes(needle)) : all
})

function toggle(folderId: string): void {
	const next = new Set(expanded.value)
	if (next.has(folderId)) next.delete(folderId)
	else next.add(folderId)
	expanded.value = next
}

watch(
	() => selected.value,
	(id) => {
		const byId = new Map(props.folders.map((folder) => [folder.id, folder]))
		let current = id ? byId.get(id)?.parentId : null
		const next = new Set(expanded.value)
		while (current) {
			next.add(current)
			current = byId.get(current)?.parentId ?? null
		}
		expanded.value = next
	},
	{ immediate: true },
)
</script>

<template>
	<div class="flex flex-col gap-2">
		<UInput
			v-model="filter"
			icon="i-ph-magnifying-glass"
			size="sm"
			:placeholder="t('dms_media.dialogs.find_folder')"
		/>
		<div
			class="border-default max-h-80 overflow-y-auto rounded-md border p-1"
			role="tree"
		>
			<button
				v-if="allowRoot"
				type="button"
				class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm"
				:class="selected === null ? 'bg-(--dms-accent-tint) text-highlighted' : 'hover:bg-(--dms-bg-muted)'"
				@click="selected = null"
			>
				<UIcon name="i-ph-house" class="text-muted size-4" />
				{{ rootLabel ?? t('dms_media.library.root') }}
			</button>
			<div
				v-for="row in rows"
				:key="row.folder.id"
				class="flex items-center gap-1 rounded-sm"
				:class="selected === row.folder.id ? 'bg-(--dms-accent-tint)' : 'hover:bg-(--dms-bg-muted)'"
				:style="{ paddingInlineStart: `${row.depth * 16 + 4}px` }"
				role="treeitem"
				:aria-selected="selected === row.folder.id"
			>
				<UButton
					v-if="row.hasChildren && !filter"
					:icon="expanded.has(row.folder.id) ? 'i-ph-caret-down' : 'i-ph-caret-right'"
					color="neutral"
					variant="ghost"
					size="xs"
					square
					:aria-label="t('dms_media.actions.expand')"
					@click="toggle(row.folder.id)"
				/>
				<span v-else class="w-6" />
				<UTooltip :text="row.disabledReason" :disabled="!row.disabledReason">
					<button
						type="button"
						class="flex min-w-0 flex-1 items-center gap-2 py-1.5 pe-2 text-start text-sm disabled:cursor-not-allowed disabled:opacity-45"
						:disabled="Boolean(row.disabledReason)"
						@click="selected = row.folder.id"
					>
						<FolderGlyph :folder="row.folder" />
						<span class="truncate">{{ row.folder.name }}</span>
						<FolderMarkers :folder="row.folder" />
					</button>
				</UTooltip>
			</div>
			<p v-if="rows.length === 0" class="text-muted px-2 py-3 text-sm">
				{{ t('dms_media.dialogs.no_folder_match') }}
			</p>
		</div>
	</div>
</template>
