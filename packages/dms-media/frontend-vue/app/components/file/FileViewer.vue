<script setup lang="ts">
import type { MediaAsset } from '../../types/media'
import type { AssetContent } from '../../composables/useAssetContent'
import AssetThumb from '../shared/AssetThumb.vue'

const props = defineProps<{ asset: MediaAsset; siblings: MediaAsset[] }>()
const emit = defineEmits<{ open: [string]; fullscreen: [] }>()
const contents = useAssetContent()
const assetLink = useAssetLink()
const format = useMediaFormat()
const { t } = useI18n()
const content = ref<AssetContent>({ kind: 'none' })
const filmstrip = useTemplateRef<HTMLElement>('filmstrip')

watch(
	() => [props.asset.id, props.asset.updatedAt],
	async () => {
		const shown = props.asset
		content.value = { kind: 'none' }
		const loaded = await contents.load(shown)
		if (shown.id === props.asset.id) content.value = loaded
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
			<video v-if="content.kind === 'video' && content.url" :src="content.url" controls class="max-h-[60vh] max-w-full rounded-md" />
			<img v-else-if="content.kind === 'image' && content.url" :src="content.url" :alt="asset.alt || ''" class="max-h-[60vh] max-w-full rounded-md object-contain shadow-lg" />
			<iframe
				v-else-if="content.kind === 'frame' && content.url"
				:src="content.url"
				:title="asset.name"
				class="border-default h-[60vh] w-full rounded-md border bg-white"
			/>
			<pre
				v-else-if="content.kind === 'text' && content.text !== undefined"
				class="border-default text-default h-[60vh] w-full overflow-auto rounded-md border bg-(--dms-surface-card) p-4 font-mono text-[12px] whitespace-pre-wrap"
				>{{ content.text }}<template v-if="content.isTruncated">…</template></pre
			>
			<AssetThumb v-else :asset="asset" size="lg" />
			<div class="absolute end-3 top-3 flex gap-2">
				<UButton
					v-if="content.kind === 'frame' || content.kind === 'text'"
					icon="i-ph-arrow-square-out"
					color="neutral"
					variant="outline"
					size="sm"
					:label="t('dms_media.asset_link.open_in_new_tab')"
					@click="assetLink.openInNewTab(asset)"
				/>
				<UButton icon="i-ph-arrows-out-simple" color="neutral" variant="outline" size="sm" square :aria-label="t('dms_media.file.fullscreen')" @click="emit('fullscreen')" />
			</div>
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
