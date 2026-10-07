<script setup lang="ts">
import type { DeliveryPreset, PresetsResponse } from '../types/media'

const api = useMediaApi()
const format = useMediaFormat()
const { t } = useI18n()
const data = ref<PresetsResponse | null>(null)
const failed = ref(false)
const BOX_SIZE = 140

onMounted(async () => {
	try {
		data.value = await api.presets()
	} catch {
		failed.value = true
	}
})

function boxLabel(preset: DeliveryPreset): string {
	if (preset.width && preset.height) return `${preset.width}×${preset.height}`
	if (preset.width) return `${preset.width}×–`
	if (preset.height) return `–×${preset.height}`
	return t('dms_media.presets.original')
}

function frame(preset: DeliveryPreset): { width: string; height: string } {
	const width = preset.width ?? preset.height ?? 1
	const height = preset.height ?? (preset.width ? preset.width * 0.62 : 1)
	const scale = BOX_SIZE / Math.max(width, height)
	return { width: `${Math.round(width * scale)}px`, height: `${Math.round(height * scale)}px` }
}
</script>

<template>
	<div>
		<DmsEmptyState v-if="failed" variant="error" :title="t('dms_media.presets.load_failed')" />
		<div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			<template v-if="data">
				<article v-for="preset in data.presets" :key="preset.id" class="dms-card flex flex-col overflow-hidden">
					<div class="flex h-48 items-center justify-center bg-[radial-gradient(var(--ui-border)_1px,transparent_1px)] [background-size:14px_14px]">
						<div class="relative flex items-center justify-center border border-dashed border-(--ui-primary) bg-(--dms-accent-tint)" :style="frame(preset)">
							<span class="text-primary absolute -top-5 font-mono text-[11px]">{{ boxLabel(preset) }}</span>
							<UIcon name="i-ph-image" class="text-primary size-6 opacity-60" />
						</div>
					</div>
					<div class="border-default flex flex-col gap-3 border-t p-4">
						<div class="flex items-center gap-2">
							<h3 class="text-highlighted font-mono text-base font-semibold">{{ preset.id }}</h3>
							<UBadge v-if="preset.id === 'thumb'" :label="t('dms_media.presets.required')" color="neutral" variant="subtle" size="sm" />
						</div>
						<p class="text-muted text-[13px]">{{ t(`dms_media.presets.usage.${preset.id}`, t('dms_media.presets.usage.custom')) }}</p>
						<dl class="grid grid-cols-4 gap-1.5">
							<div v-for="item in [
								{ key: 'box', value: boxLabel(preset) },
								{ key: 'fit', value: preset.fit ?? 'cover' },
								{ key: 'format', value: preset.format?.toUpperCase() ?? t('dms_media.presets.same') },
								{ key: 'quality', value: preset.quality ?? '—' },
							]" :key="item.key" class="border-default rounded-md border px-2 py-1.5">
								<dt class="text-dimmed font-mono text-[10px] uppercase">{{ t(`dms_media.presets.${item.key}`) }}</dt>
								<dd class="text-highlighted truncate font-mono text-[13px] font-semibold">{{ item.value }}</dd>
							</div>
						</dl>
						<div class="border-default flex items-center gap-2 rounded-md border px-2.5 py-1.5">
							<code class="text-default min-w-0 flex-1 truncate font-mono text-[12px]">{{ preset.urlPattern }}</code>
							<DmsCopyButton :value="preset.urlPattern" />
						</div>
						<p class="text-dimmed flex flex-wrap justify-between gap-2 font-mono text-[11px]">
							<span>{{ t('dms_media.presets.rendered', { count: format.formatNumber(preset.rendered) }) }}</span>
							<span>{{ t('dms_media.presets.key', { key: preset.cacheKey }) }}</span>
						</p>
					</div>
				</article>
			</template>
			<template v-else>
				<USkeleton v-for="index in 3" :key="index" class="h-96 rounded-lg" />
			</template>
		</div>
	</div>
</template>
