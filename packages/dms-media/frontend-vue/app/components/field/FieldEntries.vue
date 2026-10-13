<script setup lang="ts">
import type { AssetFieldEntry } from '../../composables/useAssetFieldEntries'
import type { MediaAsset } from '../../types/media'
import AssetThumb from '../shared/AssetThumb.vue'
import FieldAltPopover from './FieldAltPopover.vue'
import FieldEntryMenu from './FieldEntryMenu.vue'

const props = defineProps<{
	entries: AssetFieldEntry[]
	/** `grid`: image thumbnails; `list`: rows with the file name, for documents. */
	layout: 'grid' | 'list'
	/** The first entry is the cover. */
	hasCover?: boolean
	disabled?: boolean
	canEditAlt: (asset: MediaAsset) => boolean
}>()
const emit = defineEmits<{
	move: [from: number, to: number]
	remove: [string]
	preview: [string]
	altSaved: [MediaAsset]
}>()
const { t } = useI18n()
const format = useMediaFormat()
const list = useTemplateRef<HTMLElement>('list')
const draggedIndex = ref<number | null>(null)
const keysHintId = useId()

const KEY_STEPS: Record<string, number> = {
	ArrowLeft: -1,
	ArrowUp: -1,
	ArrowRight: 1,
	ArrowDown: 1,
}

function nameOf(entry: AssetFieldEntry): string {
	if (entry.asset) return entry.asset.name
	return entry.loading
		? t('dms_media.field_widget.loading')
		: t('dms_media.field_widget.missing.title')
}

function positionLabel(entry: AssetFieldEntry, index: number): string {
	const position = t('dms_media.field_widget.position', {
		index: index + 1,
		total: props.entries.length,
	})
	const cover =
		props.hasCover && index === 0
			? ` · ${t('dms_media.field_widget.cover')}`
			: ''
	return `${nameOf(entry)}, ${position}${cover}`
}

async function move(from: number, to: number): Promise<void> {
	if (props.disabled || to < 0 || to >= props.entries.length || from === to)
		return
	emit('move', from, to)
	await nextTick()
	list.value?.querySelector<HTMLElement>(`[data-index="${to}"]`)?.focus()
}

function onKeydown(event: KeyboardEvent, index: number): void {
	const step = KEY_STEPS[event.key]
	if (!event.altKey || step === undefined) return
	event.preventDefault()
	void move(index, index + step)
}

function onDragStart(index: number): void {
	draggedIndex.value = index
}

/** Files dropped on an entry go on to the field, which uploads them; an entry dropped here moves. */
function onDropOn(event: DragEvent, index: number): void {
	event.preventDefault()
	const from = draggedIndex.value
	draggedIndex.value = null
	if (event.dataTransfer?.files.length) return
	event.stopPropagation()
	if (from !== null) void move(from, index)
}

function metaOf(asset: MediaAsset): string {
	return [
		extensionOf(asset).toUpperCase(),
		format.formatBytes(asset.size),
	].join(' · ')
}
</script>

<template>
	<div>
		<ul
			ref="list"
			:class="
				layout === 'grid'
					? 'grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2'
					: 'flex flex-col gap-1.5'
			"
		>
			<li
				v-for="(entry, index) in entries"
				:key="entry.id"
				:data-index="index"
				tabindex="0"
				:aria-label="positionLabel(entry, index)"
				:aria-describedby="disabled ? undefined : keysHintId"
				:aria-busy="entry.loading"
				class="focus-visible:ring-(--ui-primary) group relative rounded-md outline-none focus-visible:ring-2"
				:class="[
					draggedIndex === index && 'opacity-50',
					layout === 'grid'
						? 'overflow-hidden'
						: 'border-default flex items-center gap-2.5 border p-2',
					entry.missing && 'border-(--ui-error)/40 border-dashed',
				]"
				:draggable="!disabled"
				@dragstart="onDragStart(index)"
				@dragend="draggedIndex = null"
				@dragover.prevent
				@drop="onDropOn($event, index)"
				@keydown="onKeydown($event, index)"
			>
				<template v-if="layout === 'grid'">
					<button
						v-if="entry.asset"
						type="button"
						tabindex="-1"
						class="block aspect-square w-full"
						:title="entry.asset.name"
						:aria-label="
							t('dms_media.field_widget.menu.preview_named', {
								name: entry.asset.name,
							})
						"
						@click="emit('preview', entry.id)"
					>
						<AssetThumb :asset="entry.asset" size="fill" />
					</button>
					<USkeleton
						v-else-if="entry.loading"
						class="aspect-square w-full rounded-md"
					/>
					<div
						v-else
						class="text-error border-(--ui-error)/40 flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed p-2 text-center text-[12px]"
					>
						<UIcon name="i-ph-file-x" class="size-6" />
						{{ nameOf(entry) }}
					</div>
					<span
						v-if="entry.asset"
						class="pointer-events-none absolute start-1.5 top-1.5 rounded-sm bg-black/65 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white"
					>
						{{
							hasCover && index === 0
								? t('dms_media.field_widget.cover')
								: index + 1
						}}
					</span>
					<div
						v-if="!disabled"
						class="absolute end-1.5 top-1.5 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
					>
						<FieldEntryMenu
							:index="index"
							:count="entries.length"
							:name="nameOf(entry)"
							:has-cover="hasCover"
							:can-preview="!!entry.asset"
							overlay
							@move="(to) => move(index, to)"
							@remove="emit('remove', entry.id)"
							@preview="emit('preview', entry.id)"
						/>
					</div>
					<div
						v-if="entry.asset"
						class="bg-linear-to-t absolute inset-x-0 bottom-0 flex items-end gap-1 from-black/75 to-transparent px-1.5 pb-1.5 pt-4"
					>
						<span
							class="min-w-0 flex-1 truncate text-[11px] text-white"
							:title="entry.asset.name"
						>
							{{ entry.asset.name }}
						</span>
						<FieldAltPopover
							v-if="isImageAsset(entry.asset)"
							:asset="entry.asset"
							:can-edit="!disabled && canEditAlt(entry.asset)"
							overlay
							@saved="emit('altSaved', $event)"
						/>
					</div>
				</template>
				<template v-else>
					<span
						class="text-dimmed w-4 shrink-0 text-center font-mono text-[11px]"
					>
						{{ index + 1 }}
					</span>
					<AssetThumb v-if="entry.asset" :asset="entry.asset" size="sm" />
					<USkeleton
						v-else-if="entry.loading"
						class="size-10 shrink-0 rounded-md"
					/>
					<UIcon v-else name="i-ph-file-x" class="text-error size-6 shrink-0" />
					<div class="min-w-0 flex-1">
						<USkeleton v-if="entry.loading" class="h-4 w-40 max-w-full" />
						<p
							v-else
							class="truncate text-[13px] font-medium"
							:class="entry.asset ? 'text-highlighted' : 'text-error'"
							:title="nameOf(entry)"
						>
							{{ nameOf(entry) }}
						</p>
						<p
							v-if="entry.asset"
							class="text-dimmed flex flex-wrap items-center gap-1.5 font-mono text-[11px]"
						>
							{{ metaOf(entry.asset) }}
							<FieldAltPopover
								v-if="isImageAsset(entry.asset)"
								:asset="entry.asset"
								:can-edit="!disabled && canEditAlt(entry.asset)"
								@saved="emit('altSaved', $event)"
							/>
						</p>
						<p v-else-if="entry.missing" class="text-muted text-[12px]">
							{{ t('dms_media.field_widget.missing.hint') }}
						</p>
					</div>
					<FieldEntryMenu
						v-if="!disabled"
						:index="index"
						:count="entries.length"
						:name="nameOf(entry)"
						:can-preview="!!entry.asset"
						@move="(to) => move(index, to)"
						@remove="emit('remove', entry.id)"
						@preview="emit('preview', entry.id)"
					/>
				</template>
			</li>
			<slot name="after" />
		</ul>
		<p :id="keysHintId" class="sr-only">
			{{ t('dms_media.field_widget.reorder_keys') }}
		</p>
	</div>
</template>
