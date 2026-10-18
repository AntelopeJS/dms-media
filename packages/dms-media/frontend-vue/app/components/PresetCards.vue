<script setup lang="ts">
import type { DeliveryPreset, PresetsResponse } from '../types/media'

interface PresetExample {
	id: string
	name: string
	width: number | null
	height: number | null
}

interface PixelSize {
	width: number
	height: number
}

interface ImageSize extends DeliveryPreset {
	/** The absolute link a website copies. */
	exampleUrl: string | null
	/** The same file relative to the dashboard, whose origin carries the session. */
	examplePreviewUrl: string | null
}

interface ImageSizesResponse extends PresetsResponse {
	presets: ImageSize[]
	isDefault: boolean
	example: PresetExample | null
}

interface PresetFact {
	key: string
	value: string | number
	hint?: string
}

const format = useMediaFormat()
const { t, te } = useI18n()
const presets = useApiData<ImageSizesResponse>(MEDIA_READS.presets)
const data = presets.data
const failed = computed(() => Boolean(presets.error.value) && presets.status.value !== 'pending')
const brokenExamples = ref(new Set<string>())
const BOX_SIZE = 140
const MIN_BOX_SIZE = 28
const UNBOUNDED_RATIO = 0.62
const DEFAULT_FIT = 'cover'

/** The example's own size, or a landscape stand-in when there is none. */
const sourceSize = computed<PixelSize>(() => {
	const example = data.value?.example
	if (example?.width && example.height) return { width: example.width, height: example.height }
	const side = Math.max(1, ...(data.value?.presets ?? []).flatMap((preset) => [preset.width ?? 0, preset.height ?? 0]))
	return { width: side, height: Math.round(side * UNBOUNDED_RATIO) }
})

/** What a size renders the example to: the box when it crops, else the image fitted and never enlarged. */
function renderedSize(preset: DeliveryPreset): PixelSize {
	const source = sourceSize.value
	if (preset.width && preset.height && (preset.fit ?? DEFAULT_FIT) !== 'inside')
		return { width: preset.width, height: preset.height }
	const scale = Math.min(
		(preset.width ?? Number.POSITIVE_INFINITY) / source.width,
		(preset.height ?? Number.POSITIVE_INFINITY) / source.height,
		1,
	)
	return { width: source.width * scale, height: source.height * scale }
}

const largestSide = computed(() =>
	Math.max(1, ...(data.value?.presets ?? []).flatMap((preset) => {
		const size = renderedSize(preset)
		return [size.width, size.height]
	})),
)

function boxLabel(preset: DeliveryPreset): string {
	if (preset.width && preset.height) return `${preset.width}×${preset.height}`
	if (preset.width) return `${preset.width}×–`
	if (preset.height) return `–×${preset.height}`
	return t('dms_media.presets.original')
}

/** The rendered size drawn to one scale for every card, so sizes compare at a glance. */
function frame(preset: DeliveryPreset): { width: string; height: string } {
	const size = renderedSize(preset)
	const scale = BOX_SIZE / largestSide.value
	const side = (value: number) => `${Math.max(Math.round(value * scale), MIN_BOX_SIZE)}px`
	return { width: side(size.width), height: side(size.height) }
}

function fitLabel(fit: string | undefined): string {
	const key = `dms_media.presets.fits.${fit ?? DEFAULT_FIT}`
	return te(key) ? t(key) : (fit ?? DEFAULT_FIT)
}

function facts(preset: DeliveryPreset): PresetFact[] {
	return [
		{ key: 'box', value: boxLabel(preset) },
		{ key: 'file_type', value: preset.format?.toUpperCase() ?? t('dms_media.presets.same') },
	]
}

function technicalFacts(preset: DeliveryPreset): PresetFact[] {
	return [
		{ key: 'fit', value: fitLabel(preset.fit), hint: t(`dms_media.presets.fits.${preset.fit ?? DEFAULT_FIT}_hint`) },
		{ key: 'quality', value: preset.quality ?? '—' },
	]
}

function showsExample(preset: ImageSize): boolean {
	return Boolean(preset.examplePreviewUrl) && !brokenExamples.value.has(preset.id)
}

function markBroken(presetId: string): void {
	brokenExamples.value = new Set([...brokenExamples.value, presetId])
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<DmsEmptyState v-if="failed" variant="error" :title="t('dms_media.presets.load_failed')" />
		<template v-else>
			<div v-if="data?.isDefault" class="dms-card flex items-start gap-3 p-4">
				<UIcon name="i-ph-info" class="text-info mt-0.5 size-5 shrink-0" />
				<div class="min-w-0">
					<p class="text-highlighted text-sm font-medium">{{ t('dms_media.presets.defaults_title') }}</p>
					<p class="text-muted text-[13px]">{{ t('dms_media.presets.defaults_hint') }}</p>
				</div>
			</div>
			<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				<template v-if="data">
					<article v-for="preset in data.presets" :key="preset.id" class="dms-card flex flex-col overflow-hidden">
						<div class="relative flex h-48 items-center justify-center bg-[radial-gradient(var(--ui-border)_1px,transparent_1px)] [background-size:14px_14px]">
							<div class="relative flex items-center justify-center overflow-hidden border border-dashed border-(--ui-primary) bg-(--dms-accent-tint)" :style="frame(preset)">
								<img
									v-if="showsExample(preset)"
									:src="preset.examplePreviewUrl ?? undefined"
									:alt="t('dms_media.presets.example_alt', { name: data.example?.name ?? '', size: preset.id })"
									class="size-full"
									:class="(preset.fit ?? DEFAULT_FIT) === 'cover' ? 'object-cover' : 'object-contain'"
									loading="lazy"
									@error="markBroken(preset.id)"
								>
								<UIcon v-else name="i-ph-image" class="text-primary size-6 opacity-60" />
							</div>
							<span class="text-primary bg-(--dms-surface-card)/90 absolute start-2 top-2 rounded px-1.5 font-mono text-[11px]">{{ boxLabel(preset) }}</span>
						</div>
						<div class="border-default flex flex-col gap-3 border-t p-4">
							<div class="flex items-center gap-2">
								<h3 class="text-highlighted font-mono text-base font-semibold">{{ preset.id }}</h3>
								<UBadge v-if="preset.id === 'thumb'" :label="t('dms_media.presets.required')" color="neutral" variant="subtle" size="sm" />
							</div>
							<p class="text-muted text-[13px]">{{ t(`dms_media.presets.usage.${preset.id}`, t('dms_media.presets.usage.custom')) }}</p>
							<dl class="grid grid-cols-2 gap-1.5">
								<div v-for="item in facts(preset)" :key="item.key" class="border-default min-w-0 rounded-md border px-2 py-1.5">
									<dt class="text-dimmed truncate text-[10px] uppercase">{{ t(`dms_media.presets.${item.key}`) }}</dt>
									<dd class="text-highlighted truncate text-[13px] font-semibold">{{ item.value }}</dd>
								</div>
							</dl>
							<p class="text-muted flex items-center gap-1.5 text-[12px]">
								<UIcon name="i-ph-arrows-in-simple" class="size-3.5 shrink-0" />
								{{ t('dms_media.presets.never_upscaled') }}
							</p>
							<div v-if="preset.exampleUrl" class="flex flex-col gap-1">
								<p class="text-dimmed text-[11px]">{{ t('dms_media.presets.example_link', { name: data.example?.name ?? '' }) }}</p>
								<div class="border-default flex items-center gap-2 rounded-md border px-2.5 py-1.5">
									<ULink :to="preset.exampleUrl" target="_blank" external class="text-default min-w-0 flex-1 truncate font-mono text-[12px] hover:underline">{{ preset.exampleUrl }}</ULink>
									<DmsCopyButton :value="preset.exampleUrl" />
								</div>
							</div>
							<p class="text-dimmed text-[11px]">{{ t('dms_media.presets.rendered', { count: format.formatNumber(preset.rendered) }, preset.rendered) }}</p>
							<details class="group border-default rounded-md border">
								<summary class="text-muted flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium">
									<UIcon name="i-ph-caret-right" class="size-3.5 transition-transform group-open:rotate-90" />
									{{ t('dms_media.presets.technical') }}
								</summary>
								<div class="border-default flex flex-col gap-2 border-t p-2.5">
									<dl class="grid grid-cols-2 gap-1.5">
										<UTooltip v-for="item in technicalFacts(preset)" :key="item.key" :text="item.hint" :disabled="!item.hint">
											<div class="border-default min-w-0 rounded-md border px-2 py-1.5">
												<dt class="text-dimmed truncate text-[10px] uppercase">{{ t(`dms_media.presets.${item.key}`) }}</dt>
												<dd class="text-highlighted truncate text-[13px] font-semibold">{{ item.value }}</dd>
											</div>
										</UTooltip>
									</dl>
									<p class="text-dimmed text-[11px]">{{ t('dms_media.presets.pattern_hint') }}</p>
									<div class="border-default flex items-center gap-2 rounded-md border px-2.5 py-1.5">
										<code class="text-default min-w-0 flex-1 truncate font-mono text-[12px]">{{ preset.urlPattern }}</code>
										<DmsCopyButton :value="preset.urlPattern" />
									</div>
									<UTooltip :text="t('dms_media.presets.key_hint')">
										<span class="text-dimmed font-mono text-[11px]">{{ t('dms_media.presets.key', { key: preset.cacheKey }) }}</span>
									</UTooltip>
								</div>
							</details>
						</div>
					</article>
				</template>
				<template v-else>
					<USkeleton v-for="index in 3" :key="index" class="h-96 rounded-lg" />
				</template>
			</div>
		</template>
	</div>
</template>
