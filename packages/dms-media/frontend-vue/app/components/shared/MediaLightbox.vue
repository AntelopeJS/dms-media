<script setup lang="ts">
import type { MediaAsset } from '../../types/media'
import type { AssetContent } from '../../composables/useAssetContent'
import AssetThumb from './AssetThumb.vue'

const props = withDefaults(
	defineProps<{
		assets: MediaAsset[]
		startId: string
		canEdit?: (asset: MediaAsset) => boolean
		/** Bound by the overlay that opens the lightbox, which keeps it mounted between openings. */
		open?: boolean
	}>(),
	{ canEdit: undefined, open: true },
)
/** Closing gives the id of the file shown last, for the caller to select or open it. */
const emit = defineEmits<{ close: [string | null]; 'update:open': [boolean] }>()
const { t } = useI18n()
const contents = useAssetContent()
const assetLink = useAssetLink()
const format = useMediaFormat()
const index = ref(startIndex())
const loaded = reactive(new Map<string, AssetContent>())

const asset = computed(() => props.assets[index.value])
const content = computed(() => (asset.value ? loaded.get(contentKey(asset.value)) : undefined))
const position = computed(() => t('dms_media.lightbox.position', { index: index.value + 1, total: props.assets.length }))
const canOpenInTab = computed(() => content.value?.kind === 'frame' || content.value?.kind === 'text')

function startIndex(): number {
	return Math.max(
		props.assets.findIndex((asset) => asset.id === props.startId),
		0,
	)
}

watch(
	() => [props.open, props.startId, props.assets] as const,
	([open]) => {
		if (open) index.value = startIndex()
	},
)

function contentKey(target: MediaAsset): string {
	return `${target.id}:${target.updatedAt}`
}

async function load(target: MediaAsset | undefined): Promise<void> {
	if (!target || loaded.has(contentKey(target))) return
	loaded.set(contentKey(target), await contents.load(target))
}

watch(asset, (target) => void load(target), { immediate: true })

function step(delta: number): void {
	const next = index.value + delta
	if (next < 0 || next >= props.assets.length) return
	index.value = next
}

function close(): void {
	if (!props.open) return
	emit('update:open', false)
	emit('close', asset.value?.id ?? null)
}

function edit(): void {
	if (!asset.value || !props.canEdit?.(asset.value) || !isEditableAsset(asset.value)) return
	void navigateDms(editorLink(asset.value.id))
	close()
}

function download(): void {
	if (asset.value) void assetLink.download(asset.value)
}

function whileOpen(handler: () => void): () => void {
	return () => {
		if (props.open) handler()
	}
}

defineShortcuts({
	arrowleft: whileOpen(() => step(-1)),
	arrowright: whileOpen(() => step(1)),
	e: whileOpen(edit),
	' ': whileOpen(close),
})
</script>

<template>
	<UModal
		:open="open"
		fullscreen
		:title="asset?.name"
		:ui="{ content: 'bg-(--dms-surface-card)', body: 'flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6' }"
		@update:open="(open: boolean) => !open && close()"
	>
		<template #header>
			<div v-if="asset" class="flex min-w-0 flex-1 items-center gap-3">
				<div class="min-w-0 flex-1">
					<p class="text-highlighted truncate text-sm font-semibold">{{ asset.name }}</p>
					<p class="text-muted truncate text-[12px]">
						<span class="font-mono">{{ position }}</span>
						· {{ format.formatBytes(asset.size) }}
						<template v-if="asset.width">· {{ format.formatDimensions(asset.width, asset.height) }}</template>
						· {{ t(`dms_media.visibility.${asset.effectiveVisibility}`) }}
					</p>
				</div>
				<UButton
					v-if="canOpenInTab"
					icon="i-ph-arrow-square-out"
					color="neutral"
					variant="outline"
					size="sm"
					:label="t('dms_media.asset_link.open_in_new_tab')"
					@click="assetLink.openInNewTab(asset)"
				/>
				<UButton icon="i-ph-download-simple" color="neutral" variant="outline" size="sm" :label="t('dms_media.actions.download')" @click="download" />
				<UButton
					v-if="canEdit?.(asset) && isEditableAsset(asset)"
					icon="i-ph-crop"
					color="neutral"
					variant="outline"
					size="sm"
					:label="t('dms_media.actions.edit_image')"
					@click="edit"
				>
					<template #trailing><UKbd value="E" size="sm" /></template>
				</UButton>
				<UButton icon="i-ph-x" color="neutral" variant="ghost" size="sm" square :aria-label="t('dms_media.actions.close')" @click="close" />
			</div>
		</template>
		<template #body>
			<UButton
				icon="i-ph-caret-left"
				color="neutral"
				variant="outline"
				class="absolute start-4 top-1/2 z-10 -translate-y-1/2 rounded-full"
				:disabled="index === 0"
				:aria-label="t('dms_media.lightbox.previous')"
				@click="step(-1)"
			/>
			<figure v-if="asset" class="flex size-full max-h-full min-h-0 max-w-full flex-col items-center justify-center gap-3">
				<video v-if="content?.kind === 'video' && content.url" :src="content.url" controls class="max-h-[75vh] max-w-full rounded-md" />
				<img v-else-if="content?.kind === 'image' && content.url" :src="content.url" :alt="asset.alt || ''" class="max-h-[75vh] max-w-full rounded-md object-contain" />
				<iframe
					v-else-if="content?.kind === 'frame' && content.url"
					:src="content.url"
					:title="asset.name"
					class="border-default h-[75vh] w-full max-w-5xl rounded-md border bg-white"
				/>
				<pre
					v-else-if="content?.kind === 'text' && content.text !== undefined"
					class="border-default text-default h-[75vh] w-full max-w-5xl overflow-auto rounded-md border p-4 font-mono text-[12px] whitespace-pre-wrap"
					>{{ content.text }}<template v-if="content.isTruncated">…</template></pre
				>
				<AssetThumb v-else :asset="asset" size="lg" />
				<figcaption class="text-muted max-w-xl text-center text-[13px]">
					<template v-if="asset.alt">{{ asset.alt }}</template>
					<span v-else-if="isImageAsset(asset)" class="text-warning">{{ t('dms_media.alt.missing_long') }}</span>
				</figcaption>
			</figure>
			<UButton
				icon="i-ph-caret-right"
				color="neutral"
				variant="outline"
				class="absolute end-4 top-1/2 z-10 -translate-y-1/2 rounded-full"
				:disabled="index >= assets.length - 1"
				:aria-label="t('dms_media.lightbox.next')"
				@click="step(1)"
			/>
		</template>
	</UModal>
</template>
