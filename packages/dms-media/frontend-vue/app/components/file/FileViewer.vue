<script setup lang="ts">
import type { MediaAsset } from '../../types/media'
import AssetThumb from '../shared/AssetThumb.vue'

const props = defineProps<{ asset: MediaAsset; siblings: MediaAsset[] }>()
const emit = defineEmits<{ open: [string]; fullscreen: [] }>()
const api = useMediaApi()
const format = useMediaFormat()
const { t } = useI18n()
const source = ref<string | null>(null)
const filmstrip = useTemplateRef<HTMLElement>('filmstrip')

watch(
	() => [props.asset.id, props.asset.updatedAt],
	async () => {
		source.value = null
		const canShow = isImageAsset(props.asset) || props.asset.typeGroup === 'video'
		if (!canShow) return
		const preset = props.asset.typeGroup === 'image' ? 'preview' : undefined
		source.value = (await api.readUrl(props.asset.id, preset).catch(() => null))?.url ?? null
	},
	{ immediate: true },
)

watch(
	() => props.asset.id,
	async (id) => {
		await nextTick()
		filmstrip.value?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' })
	},
	{ immediate: true },
)
</script>

<template>
	<div class="dms-card flex min-h-0 flex-col overflow-hidden">
		<div
			class="relative flex min-h-[420px] flex-1 items-center justify-center bg-[radial-gradient(var(--ui-border)_1px,transparent_1px)] [background-size:16px_16px] p-6"
		>
			<video v-if="asset.typeGroup === 'video' && source" :src="source" controls class="max-h-[60vh] max-w-full rounded-md" />
			<img v-else-if="source" :src="source" :alt="asset.alt || ''" class="max-h-[60vh] max-w-full rounded-md object-contain shadow-lg" />
			<AssetThumb v-else :asset="asset" size="lg" />
			<UButton
				icon="i-ph-arrows-out-simple"
				color="neutral"
				variant="outline"
				size="sm"
				square
				class="absolute end-3 top-3"
				:aria-label="t('dms_media.file.fullscreen')"
				@click="emit('fullscreen')"
			/>
		</div>
		<div class="border-default text-muted flex flex-wrap items-center gap-3 border-t px-4 py-2 text-[12px]">
			<span class="font-mono">
				<template v-if="asset.width">{{ format.formatDimensions(asset.width, asset.height) }} · </template>
				{{ format.formatBytes(asset.size) }} · {{ extensionOf(asset).toUpperCase() }}
			</span>
			<span class="ms-auto flex items-center gap-1 max-sm:hidden">
				<UKbd value="arrowleft" size="sm" /><UKbd value="arrowright" size="sm" />{{ t('dms_media.file.navigate_hint') }}
				<UKbd value="space" size="sm" class="ms-2" />{{ t('dms_media.file.fullscreen') }}
			</span>
		</div>
		<div v-if="siblings.length > 1" ref="filmstrip" class="border-default flex gap-2 overflow-x-auto border-t p-2">
			<button
				v-for="sibling in siblings"
				:key="sibling.id"
				type="button"
				:data-id="sibling.id"
				class="shrink-0 overflow-hidden rounded-md"
				:class="sibling.id === asset.id ? 'ring-primary ring-2' : 'opacity-70 hover:opacity-100'"
				:aria-label="sibling.name"
				:aria-current="sibling.id === asset.id"
				@click="emit('open', sibling.id)"
			>
				<AssetThumb :asset="sibling" size="md" />
			</button>
		</div>
	</div>
</template>
