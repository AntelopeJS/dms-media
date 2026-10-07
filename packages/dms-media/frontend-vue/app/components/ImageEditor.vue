<script setup lang="ts">
import { Cropper, Preview } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'
import type { AssetDetails } from '../types/media'

interface CropCoordinates {
	left: number
	top: number
	width: number
	height: number
}

interface CropperImage {
	src: string
	width: number
	height: number
	transforms: { rotate: number; flip: { horizontal: boolean; vertical: boolean } }
}

interface CropperChange {
	coordinates: CropCoordinates
	image: CropperImage
}

interface CropperHandle {
	rotate: (angle: number) => void
	zoom: (factor: number) => void
	reset: () => void
	refresh: () => void
}

interface AspectOption {
	id: string
	label: string
	ratio?: number
	hint?: string
	icon: string
}

const FULL_TURN = 360
const QUARTER_TURN = 90
const ZOOM_STEP = 1.2
const PRESET_PREVIEW_SIZE = 128

const route = useDmsRoute()
const api = useMediaApi()
const { t } = useI18n()
const toast = useToast()
const format = useMediaFormat()
const { confirm } = useConfirm()
const cropper = useTemplateRef<CropperHandle>('cropper')
const details = ref<AssetDetails | null>(null)
const source = ref<string | null>(null)
const loadError = ref(false)
const rotation = ref(0)
const aspect = ref('free')
const change = ref<CropperChange | null>(null)
const isSaving = ref(false)

const assetId = computed(() => (typeof route.query.asset === 'string' ? route.query.asset : undefined))
const asset = computed(() => details.value?.asset)
const originalRatio = computed(() =>
	asset.value?.width && asset.value?.height ? asset.value.width / asset.value.height : undefined,
)

const aspects = computed<AspectOption[]>(() => [
	{ id: 'free', label: t('dms_media.editor.aspects.free'), icon: 'i-ph-selection' },
	{ id: 'square', label: '1:1', ratio: 1, hint: 'thumb', icon: 'i-ph-square' },
	{ id: 'original', label: originalRatioLabel.value, ratio: originalRatio.value, hint: t('dms_media.editor.aspects.original'), icon: 'i-ph-rectangle' },
	{ id: '4:3', label: '4:3', ratio: 4 / 3, icon: 'i-ph-rectangle' },
	{ id: '16:9', label: '16:9', ratio: 16 / 9, icon: 'i-ph-rectangle' },
	{ id: 'social', label: '1.91:1', ratio: 1.91, hint: 'social', icon: 'i-ph-rectangle' },
])

const originalRatioLabel = computed(() => {
	const width = asset.value?.width
	const height = asset.value?.height
	if (!width || !height) return t('dms_media.editor.aspects.original')
	const divisor = greatestCommonDivisor(width, height)
	const label = `${width / divisor}:${height / divisor}`
	return label.length > 7 ? (width / height).toFixed(2) : label
})

interface ImageSize {
	imageSize: { width: number; height: number }
}

function fullImage({ imageSize }: ImageSize) {
	return { width: imageSize.width, height: imageSize.height }
}

function greatestCommonDivisor(left: number, right: number): number {
	return right === 0 ? left : greatestCommonDivisor(right, left % right)
}

const stencilRatio = computed(() => aspects.value.find((option) => option.id === aspect.value)?.ratio)
const rotatedSize = computed(() => {
	const image = change.value?.image
	if (!image) return null
	const quarter = rotation.value % 180 !== 0
	return quarter ? { width: image.height, height: image.width } : { width: image.width, height: image.height }
})
const cropChanged = computed(() => {
	const coordinates = change.value?.coordinates
	const size = rotatedSize.value
	if (!coordinates || !size) return false
	return coordinates.width < size.width - 1 || coordinates.height < size.height - 1
})

interface PendingChange {
	icon: string
	label: string
	detail: string
}

const pending = computed<PendingChange[]>(() => {
	const changes: PendingChange[] = []
	if (rotation.value)
		changes.push({ icon: 'i-ph-arrow-clockwise', label: t('dms_media.editor.rotate_change', { degrees: rotation.value }), detail: t('dms_media.editor.applied_first') })
	if (cropChanged.value && change.value)
		changes.push({
			icon: 'i-ph-crop',
			label: aspect.value === 'free' ? t('dms_media.editor.crop_free') : t('dms_media.editor.crop_to', { ratio: aspects.value.find((option) => option.id === aspect.value)?.label }),
			detail: format.formatDimensions(Math.round(change.value.coordinates.width), Math.round(change.value.coordinates.height)),
		})
	return changes
})

const thumbCoordinates = computed(() => {
	const coordinates = change.value?.coordinates
	if (!coordinates) return null
	const side = Math.min(coordinates.width, coordinates.height)
	return {
		left: coordinates.left + (coordinates.width - side) / 2,
		top: coordinates.top + (coordinates.height - side) / 2,
		width: side,
		height: side,
	}
})

async function load(): Promise<void> {
	if (!assetId.value) return
	loadError.value = false
	try {
		details.value = await api.details(assetId.value)
		source.value = (await api.readUrl(assetId.value)).url
	} catch {
		loadError.value = true
	}
}

function rotate(angle: number): void {
	rotation.value = (rotation.value + angle + FULL_TURN) % FULL_TURN
	cropper.value?.rotate(angle)
}

function reset(): void {
	if (rotation.value) cropper.value?.rotate(-rotation.value)
	rotation.value = 0
	aspect.value = 'free'
	cropper.value?.reset()
}

function normalizedCrop() {
	const coordinates = change.value?.coordinates
	const size = rotatedSize.value
	if (!coordinates || !size || !cropChanged.value) return undefined
	const clamp = (value: number) => Math.min(Math.max(value, 0), 1)
	const x = clamp(coordinates.left / size.width)
	const y = clamp(coordinates.top / size.height)
	return {
		x,
		y,
		width: Math.min(clamp(coordinates.width / size.width), 1 - x),
		height: Math.min(clamp(coordinates.height / size.height), 1 - y),
	}
}

async function save(): Promise<void> {
	if (!asset.value || pending.value.length === 0 || isSaving.value) return
	isSaving.value = true
	try {
		await api.transform(asset.value.id, { crop: normalizedCrop(), rotate: rotation.value || undefined })
		toast.add({
			title: t('dms_media.editor.saved'),
			description: t('dms_media.editor.saved_description'),
			color: 'success',
			icon: 'i-ph-check-circle',
			actions: [{ label: t('dms_media.editor.revert_to_original'), onClick: () => void revert(true) }],
		})
		await navigateDms(fileLink(asset.value.id))
	} catch (error) {
		useApiError(error, { title: t('dms_media.editor.save_failed') })
	} finally {
		isSaving.value = false
	}
}

async function revert(skipConfirm = false): Promise<void> {
	const current = asset.value
	if (!current) return
	const run = async () => {
		await api.revert(current.id)
		toast.add({ title: t('dms_media.editor.reverted'), color: 'success', icon: 'i-ph-arrow-counter-clockwise' })
		await navigateDms(fileLink(current.id))
	}
	if (skipConfirm) return run().catch((error) => useApiError(error, { title: t('dms_media.editor.revert_failed') }))
	await confirm({
		title: t('dms_media.editor.revert_title'),
		description: t('dms_media.editor.revert_description'),
		icon: 'i-ph-arrow-counter-clockwise',
		color: 'warning',
		confirmLabel: t('dms_media.editor.revert_to_original'),
		onConfirm: run,
	})
}

function discard(): void {
	void navigateDms(assetId.value ? fileLink(assetId.value) : MEDIA_ROUTES.files)
}

watch(assetId, () => void load(), { immediate: true })
watch(stencilRatio, async () => {
	await nextTick()
	cropper.value?.refresh()
})

definePageShortcuts(() => ({
	meta_s: { usingInput: true, handler: () => void save() },
	escape: discard,
}))
</script>

<template>
	<div class="flex flex-col gap-4">
		<header class="flex flex-wrap items-start gap-3">
			<UButton icon="i-ph-arrow-left" color="neutral" variant="outline" square :aria-label="t('dms_media.actions.back')" @click="discard" />
			<div class="min-w-0 flex-1">
				<h1 class="text-highlighted truncate text-2xl font-semibold tracking-tight">
					{{ asset ? t('dms_media.editor.heading', { name: asset.name }) : t('dms_media.editor.title') }}
				</h1>
				<p class="text-muted mt-1 text-sm">{{ t('dms_media.editor.description') }}</p>
			</div>
		</header>
		<DmsEmptyState
			v-if="loadError"
			variant="error"
			:title="t('dms_media.editor.load_failed')"
			:description="t('dms_media.editor.load_failed_description')"
			:actions="[{ label: t('dms_media.actions.retry'), icon: 'i-ph-arrow-clockwise', onClick: load }]"
		/>
		<DmsEmptyState
			v-else-if="asset && !isEditableAsset(asset)"
			variant="no-access"
			icon="i-ph-image-broken"
			:title="t('dms_media.editor.not_editable')"
			:description="t('dms_media.editor.not_editable_description')"
		/>
		<div v-else class="dms-card grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_300px]">
			<div class="relative flex min-h-[480px] flex-col bg-[conic-gradient(var(--dms-bg-muted)_90deg,transparent_90deg_180deg,var(--dms-bg-muted)_180deg_270deg,transparent_270deg)] [background-size:20px_20px]">
				<div class="min-h-0 flex-1 p-4">
					<Cropper
						v-if="source"
						ref="cropper"
						class="h-[56vh] max-h-[640px]"
						:src="source"
						:canvas="false"
						:check-orientation="false"
						:stencil-props="{ aspectRatio: stencilRatio }"
						image-restriction="stencil"
						:default-size="fullImage"
						@change="change = $event"
					/>
					<USkeleton v-else class="h-[56vh] w-full" />
				</div>
				<div class="flex justify-center pb-4">
					<div class="dms-card flex items-center gap-1 p-1">
						<UTooltip :text="t('dms_media.editor.rotate_left')">
							<UButton icon="i-ph-arrow-counter-clockwise" color="neutral" variant="ghost" size="sm" square :aria-label="t('dms_media.editor.rotate_left')" @click="rotate(-QUARTER_TURN)" />
						</UTooltip>
						<UTooltip :text="t('dms_media.editor.rotate_right')">
							<UButton icon="i-ph-arrow-clockwise" color="neutral" variant="ghost" size="sm" square :aria-label="t('dms_media.editor.rotate_right')" @click="rotate(QUARTER_TURN)" />
						</UTooltip>
						<span class="bg-(--ui-border) mx-1 h-5 w-px" />
						<UButton icon="i-ph-magnifying-glass-minus" color="neutral" variant="ghost" size="sm" square :aria-label="t('dms_media.editor.zoom_out')" @click="cropper?.zoom(1 / ZOOM_STEP)" />
						<UButton icon="i-ph-magnifying-glass-plus" color="neutral" variant="ghost" size="sm" square :aria-label="t('dms_media.editor.zoom_in')" @click="cropper?.zoom(ZOOM_STEP)" />
						<span class="bg-(--ui-border) mx-1 h-5 w-px" />
						<UButton icon="i-ph-arrow-u-up-left" color="neutral" variant="ghost" size="sm" :label="t('dms_media.editor.reset')" @click="reset" />
					</div>
				</div>
			</div>
			<aside class="border-default flex flex-col border-s max-lg:border-s-0 max-lg:border-t">
				<section class="border-default border-b p-4">
					<DmsEyebrow :label="t('dms_media.editor.aspect_ratio')" tone="muted" class="mb-2" />
					<div class="grid grid-cols-3 gap-1.5" role="radiogroup">
						<button
							v-for="option in aspects"
							:key="option.id"
							type="button"
							role="radio"
							:aria-checked="aspect === option.id"
							class="border-default flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-[12px]"
							:class="aspect === option.id ? 'border-(--ui-primary) bg-(--dms-accent-tint) text-highlighted' : 'text-muted hover:bg-(--dms-bg-muted)'"
							@click="aspect = option.id"
						>
							<UIcon :name="option.icon" class="size-4" />
							<span class="font-mono">{{ option.label }}</span>
							<span v-if="option.hint" class="text-dimmed text-[10px]">{{ option.hint }}</span>
						</button>
					</div>
				</section>
				<section class="border-default border-b p-4">
					<DmsEyebrow :label="t('dms_media.editor.pending')" tone="muted" class="mb-2" />
					<ul v-if="pending.length" class="flex flex-col gap-1.5 text-[13px]">
						<li v-for="item in pending" :key="item.label" class="flex items-center gap-2">
							<UIcon :name="item.icon" class="text-primary size-4" />
							<span class="text-highlighted flex-1">{{ item.label }}</span>
							<span class="text-dimmed font-mono text-[11px]">{{ item.detail }}</span>
						</li>
					</ul>
					<p v-else class="text-dimmed text-[13px]">{{ t('dms_media.editor.no_changes') }}</p>
				</section>
				<section v-if="change && thumbCoordinates" class="border-default border-b p-4">
					<DmsEyebrow :label="t('dms_media.editor.sizes')" tone="muted" class="mb-2" />
					<div class="flex gap-3">
						<div class="flex flex-col gap-1">
							<Preview :width="PRESET_PREVIEW_SIZE" :height="PRESET_PREVIEW_SIZE" :image="change.image" :coordinates="thumbCoordinates" class="rounded-md" />
							<span class="text-dimmed font-mono text-[11px]">thumb · 300 × 300</span>
						</div>
						<div class="flex flex-col gap-1">
							<Preview :width="PRESET_PREVIEW_SIZE" :height="Math.round(PRESET_PREVIEW_SIZE * (change.coordinates.height / change.coordinates.width))" :image="change.image" :coordinates="change.coordinates" class="rounded-md" />
							<span class="text-dimmed font-mono text-[11px]">preview · 1600</span>
						</div>
					</div>
				</section>
				<section v-if="asset" class="border-default border-b p-4">
					<DmsEyebrow :label="t('dms_media.editor.original')" tone="muted" class="mb-2" />
					<p class="text-muted flex items-start gap-2 text-[13px]">
						<UIcon name="i-ph-shield-check" class="text-success mt-0.5 size-4 shrink-0" />
						{{ asset.hasOriginal ? t('dms_media.editor.original_kept') : t('dms_media.editor.original_first') }}
					</p>
					<UButton v-if="asset.hasOriginal" class="mt-2" variant="link" color="warning" icon="i-ph-arrow-counter-clockwise" :label="t('dms_media.editor.revert_to_original')" @click="revert()" />
				</section>
				<footer class="mt-auto flex items-center justify-end gap-2 p-4">
					<UButton color="neutral" variant="outline" :label="t('dms_media.editor.discard')" @click="discard" />
					<UButton
						icon="i-ph-check"
						:loading="isSaving"
						:disabled="pending.length === 0"
						:label="pending.length ? t('dms_media.editor.save', { count: pending.length }, pending.length) : t('dms_media.editor.save_none')"
						@click="save"
					>
						<template #trailing><UKbd value="meta" size="sm" variant="subtle" /><UKbd value="S" size="sm" variant="subtle" /></template>
					</UButton>
				</footer>
			</aside>
		</div>
	</div>
</template>
