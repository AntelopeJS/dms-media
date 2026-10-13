<script setup lang="ts">
import FolderGlyph from './FolderGlyph.vue'
import FolderMarkers from './FolderMarkers.vue'
import type { MediaFolder } from '../../types/media'

const props = defineProps<{
	folders: MediaFolder[]
	isAllowed: (folder: MediaFolder) => string | undefined
	allowRoot?: boolean
	rootLabel?: string
	/** A folder unfolded and scrolled to on open, such as the one the files are in. */
	revealId?: string | null
}>()
const emit = defineEmits<{ choose: [string | null] }>()
const selected = defineModel<string | null | undefined>()
const filter = ref('')
const expanded = ref<Set<string>>(new Set())
const activeKey = ref<string>()
const treeElement = useTemplateRef<HTMLElement>('tree')
const { t } = useI18n()
const ROOT_KEY = ''
const ROW_SELECTOR = '[role=treeitem]'

const byId = computed(() => new Map(props.folders.map((folder) => [folder.id, folder])))

const byParent = computed(() => {
	const map = new Map<string | null, MediaFolder[]>()
	for (const folder of props.folders) {
		const key = folder.parentId && byId.value.has(folder.parentId) ? folder.parentId : null
		map.set(key, [...(map.get(key) ?? []), folder])
	}
	for (const [key, list] of map)
		map.set(key, [...list].sort((left, right) => NAME_COLLATOR.compare(left.name, right.name)))
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

const canExpand = (row: Row) => row.hasChildren && !filter.value

function setExpanded(folderId: string, isExpanded: boolean): void {
	const next = new Set(expanded.value)
	if (isExpanded) next.add(folderId)
	else next.delete(folderId)
	expanded.value = next
}

function expandAncestors(id: string | null | undefined): void {
	let current = id ? byId.value.get(id)?.parentId : null
	const next = new Set(expanded.value)
	while (current) {
		next.add(current)
		current = byId.value.get(current)?.parentId ?? null
	}
	expanded.value = next
}

function pick(row: Row): void {
	activeKey.value = row.folder.id
	if (canExpand(row)) setExpanded(row.folder.id, true)
	if (!row.disabledReason) selected.value = row.folder.id
}

function choose(row: Row): void {
	if (row.disabledReason) return
	selected.value = row.folder.id
	emit('choose', row.folder.id)
}

function pickRoot(): void {
	activeKey.value = ROOT_KEY
	selected.value = null
}

watch(() => selected.value, expandAncestors, { immediate: true })
onMounted(() => {
	expandAncestors(props.revealId)
	if (props.revealId) setExpanded(props.revealId, true)
	activeKey.value = selected.value ?? props.revealId ?? undefined
	void nextTick(() => treeElement.value?.querySelector('[tabindex="0"]')?.scrollIntoView({ block: 'nearest' }))
})

const focusableKey = computed(() => {
	const keys = [...(props.allowRoot ? [ROOT_KEY] : []), ...rows.value.map((row) => row.folder.id)]
	return activeKey.value !== undefined && keys.includes(activeKey.value) ? activeKey.value : keys[0]
})

function rowElements(): HTMLElement[] {
	return [...(treeElement.value?.querySelectorAll<HTMLElement>(ROW_SELECTOR) ?? [])]
}

function focusAt(index: number): void {
	const elements = rowElements()
	const target = elements[Math.min(Math.max(index, 0), elements.length - 1)]
	if (!target) return
	activeKey.value = target.dataset.key
	target.focus()
}

function rowOf(key: string | undefined): Row | undefined {
	return rows.value.find((row) => row.folder.id === key)
}

function stepInto(row: Row | undefined, index: number): void {
	if (!row || !canExpand(row)) return
	if (expanded.value.has(row.folder.id)) focusAt(index + 1)
	else setExpanded(row.folder.id, true)
}

function stepOut(row: Row | undefined): void {
	if (!row) return
	if (canExpand(row) && expanded.value.has(row.folder.id)) return setExpanded(row.folder.id, false)
	const parentIndex = rowElements().findIndex((element) => element.dataset.key === row.folder.parentId)
	if (parentIndex >= 0) focusAt(parentIndex)
}

function activate(row: Row | undefined, key: string | undefined): void {
	if (key === ROOT_KEY) return pickRoot()
	if (row) pick(row)
}

function onKeydown(event: KeyboardEvent): void {
	const element = (event.target as HTMLElement).closest<HTMLElement>(ROW_SELECTOR)
	if (!element) return
	const index = rowElements().indexOf(element)
	const key = element.dataset.key
	const row = rowOf(key)
	const handlers: Record<string, () => void> = {
		ArrowDown: () => focusAt(index + 1),
		ArrowUp: () => focusAt(index - 1),
		Home: () => focusAt(0),
		End: () => focusAt(rowElements().length - 1),
		ArrowRight: () => stepInto(row, index),
		ArrowLeft: () => stepOut(row),
		Enter: () => activate(row, key),
		' ': () => activate(row, key),
	}
	const handler = handlers[event.key]
	if (!handler) return
	event.preventDefault()
	handler()
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<DmsSearchInput v-model="filter" size="sm" data-initial-focus :placeholder="t('dms_media.dialogs.find_folder')" />
		<div
			ref="tree"
			class="border-default max-h-80 overflow-y-auto rounded-md border p-1"
			role="tree"
			:aria-label="t('dms_media.dialogs.folder_tree')"
			@keydown="onKeydown"
		>
			<div
				v-if="allowRoot"
				role="treeitem"
				aria-level="1"
				:aria-selected="selected === null"
				:data-key="ROOT_KEY"
				:tabindex="focusableKey === ROOT_KEY ? 0 : -1"
				class="focus-visible:ring-primary flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm outline-none focus-visible:ring-2"
				:class="selected === null ? 'bg-(--dms-accent-tint) text-highlighted' : 'hover:bg-(--dms-bg-muted)'"
				@click="pickRoot"
				@dblclick="emit('choose', null)"
			>
				<UIcon name="i-ph-house" class="text-muted size-4" />
				{{ rootLabel ?? t('dms_media.library.root') }}
			</div>
			<div
				v-for="row in rows"
				:key="row.folder.id"
				role="treeitem"
				:aria-level="row.depth + 1"
				:aria-expanded="canExpand(row) ? expanded.has(row.folder.id) : undefined"
				:aria-selected="selected === row.folder.id"
				:aria-disabled="row.disabledReason ? true : undefined"
				:data-key="row.folder.id"
				:tabindex="focusableKey === row.folder.id ? 0 : -1"
				class="focus-visible:ring-primary flex cursor-pointer items-center gap-1 rounded-sm outline-none focus-visible:ring-2"
				:class="[
					selected === row.folder.id ? 'bg-(--dms-accent-tint)' : 'hover:bg-(--dms-bg-muted)',
					row.folder.id === revealId && selected !== row.folder.id && 'ring-default ring-1 ring-inset',
				]"
				:style="{ paddingInlineStart: `${row.depth * 16 + 4}px` }"
				@click="pick(row)"
				@dblclick="choose(row)"
			>
				<UButton
					v-if="canExpand(row)"
					:icon="expanded.has(row.folder.id) ? 'i-ph-caret-down' : 'i-ph-caret-right'"
					color="neutral"
					variant="ghost"
					size="xs"
					square
					tabindex="-1"
					:aria-label="expanded.has(row.folder.id) ? t('dms_media.actions.collapse') : t('dms_media.actions.expand')"
					@click.stop="setExpanded(row.folder.id, !expanded.has(row.folder.id))"
				/>
				<span v-else class="w-6" />
				<UTooltip :text="row.disabledReason" :disabled="!row.disabledReason">
					<span
						class="flex min-w-0 flex-1 items-center gap-2 py-1.5 pe-2 text-start text-sm"
						:class="row.disabledReason && 'cursor-not-allowed opacity-45'"
					>
						<FolderGlyph :folder="row.folder" />
						<span class="truncate">{{ row.folder.name }}</span>
						<FolderMarkers :folder="row.folder" />
					</span>
				</UTooltip>
			</div>
			<p v-if="rows.length === 0" class="text-muted px-2 py-3 text-sm">
				{{ t('dms_media.dialogs.no_folder_match') }}
			</p>
		</div>
	</div>
</template>
