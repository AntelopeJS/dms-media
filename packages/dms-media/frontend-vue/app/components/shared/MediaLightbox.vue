<script setup lang="ts">
import type { MediaAsset } from '../../types/media'
import AssetThumb from './AssetThumb.vue'

const props = defineProps<{
	assets: MediaAsset[]
	startId: string
	canEdit?: (asset: MediaAsset) => boolean
}>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const api = useMediaApi()
const format = useMediaFormat()
const isOpen = ref(true)
const index = ref(Math.max(props.assets.findIndex((asset) => asset.id === props.startId), 0))
const urls = reactive(new Map<string, string>())
const isLoading = ref(false)

const asset = computed(() => props.assets[index.value])
const position = computed(() => t('dms_media.lightbox.position', { index: index.value + 1, total: props.assets.length }))

async function load(target: MediaAsset | undefined): Promise<void> {
	if (!target || urls.has(target.id) || !(isImageAsset(target) || target.typeGroup === 'video')) return
	isLoading.value = true
	try {
		const preset = target.typeGroup === 'image' ? 'preview' : undefined
		const { url } = await api.readUrl(target.id, preset)
		urls.set(target.id, url)
	} catch {
		return
	} finally {
		isLoading.value = false
	}
}

watch(asset, (target) => void load(target), { immediate: true })

function step(delta: number): void {
	const next = index.value + delta
	if (next < 0 || next >= props.assets.length) return
	index.value = next
}

function close(): void {
	isOpen.value = false
	emit('close')
}

function edit(): void {
	if (!asset.value || !props.canEdit?.(asset.value) || !isEditableAsset(asset.value)) return
	void navigateDms(editorLink(asset.value.id))
	close()
}

defineShortcuts({ arrowleft: () => step(-1), arrowright: () => step(1), e: edit })
</script>

<template>
	<UModal
		v-model:open="isOpen"
		fullscreen
		:title="asset?.name"
		:ui="{ content: 'bg-(--dms-surface-card)', body: 'flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6' }"
		@update:open="(open: boolean) => !open && emit('close')"
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
				class="absolute start-4 top-1/2 -translate-y-1/2 rounded-full"
				:disabled="index === 0"
				:aria-label="t('dms_media.lightbox.previous')"
				@click="step(-1)"
			/>
			<figure v-if="asset" class="flex max-h-full min-h-0 max-w-full flex-col items-center gap-3">
				<video
					v-if="asset.typeGroup === 'video' && urls.get(asset.id)"
					:src="urls.get(asset.id)"
					controls
					class="max-h-[75vh] max-w-full rounded-md"
				/>
				<img
					v-else-if="urls.get(asset.id)"
					:src="urls.get(asset.id)"
					:alt="asset.alt || ''"
					class="max-h-[75vh] max-w-full rounded-md object-contain"
				/>
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
				class="absolute end-4 top-1/2 -translate-y-1/2 rounded-full"
				:disabled="index >= assets.length - 1"
				:aria-label="t('dms_media.lightbox.next')"
				@click="step(1)"
			/>
		</template>
	</UModal>
</template>
