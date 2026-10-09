<script setup lang="ts">
import type { UploadItem, UploadStatus } from '../composables/useUploadQueue'
import type { MediaTree } from '../types/media'
import DestinationDialog from './dialogs/DestinationDialog.vue'

const uploads = useUploadQueue()
const api = useMediaApi()
const format = useMediaFormat()
const overlay = useOverlay()
const destinationDialog = overlay.create(DestinationDialog)
const { prefs, update } = useMediaPrefs()
const route = useDmsRoute()
const router = useDmsRouter()
const { t } = useI18n()
const tree = ref<MediaTree | null>(null)
const canUpload = computed(() => Boolean(tree.value?.folders.some((folder) => folder.rights.write)))
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const destination = ref<{ id: string; name: string } | null>(null)
const isBannerDismissed = ref(false)
const localPreviews = new Map<string, string>()
const SECONDS_PER_MINUTE = 60
const speed = ref(0)
let lastSample = { time: 0, bytes: 0 }

const STATUS_TONES: Record<UploadStatus, string> = {
	waiting: 'text-dimmed',
	uploading: 'text-primary',
	checking: 'text-primary',
	done: 'text-success',
	failed: 'text-error',
	rejected: 'text-error',
	cancelled: 'text-dimmed',
}

const items = computed(() => uploads.items.value)
const counts = computed(() => ({
	done: items.value.filter((item) => item.status === 'done').length,
	active: items.value.filter((item) => item.status === 'uploading' || item.status === 'checking').length,
	waiting: items.value.filter((item) => item.status === 'waiting').length,
	failed: items.value.filter((item) => item.status === 'failed' || item.status === 'rejected').length,
}))
const counted = computed(() => items.value.filter((item) => item.status !== 'cancelled'))
const totalBytes = computed(() => counted.value.reduce((total, item) => total + item.size, 0))
const sentBytes = computed(() =>
	counted.value.reduce((total, item) => total + (item.status === 'done' ? item.size : item.loaded), 0),
)
const progress = computed(() => (totalBytes.value ? Math.round((sentBytes.value / totalBytes.value) * 100) : 0))
const destinations = computed(() => [...new Set(items.value.map((item) => item.folderName))])
const secondsLeft = computed(() =>
	speed.value > 0 && uploads.activeCount.value ? Math.ceil((totalBytes.value - sentBytes.value) / speed.value) : null,
)
const failedRetryable = computed(() => items.value.filter((item) => item.status === 'failed').length)

watch(sentBytes, (bytes) => {
	const now = Date.now()
	if (lastSample.time && now > lastSample.time) {
		const sample = ((bytes - lastSample.bytes) / (now - lastSample.time)) * 1000
		if (sample > 0) speed.value = speed.value ? speed.value * 0.7 + sample * 0.3 : sample
	}
	lastSample = { time: now, bytes }
})

function previewOf(item: UploadItem): string | undefined {
	return item.mimetype.startsWith('image/') ? localPreviews.get(item.id) : undefined
}

function describe(item: UploadItem): string {
	if (item.status === 'rejected') return t('dms_media.queue.reasons.too_large', { size: format.formatBytes(uploads.maxUploadBytes.value) })
	if (item.status === 'failed') return t(`dms_media.queue.reasons.${item.failure ?? 'server'}`)
	if (item.status === 'done' && item.asset?.width) return `${format.formatDimensions(item.asset.width, item.asset.height)} · ${t('dms_media.queue.added', { name: item.folderName })}`
	if (item.status === 'done') return t('dms_media.queue.added', { name: item.folderName })
	if (item.status === 'checking') return t('dms_media.queue.checking_detail')
	if (item.status === 'uploading') return t('dms_media.queue.uploading_detail', { name: item.folderName })
	return t('dms_media.queue.waiting_detail', { name: item.folderName })
}

function sizeLabel(item: UploadItem): string {
	if (item.status === 'uploading') return `${format.formatBytes(item.loaded)} / ${format.formatBytes(item.size)}`
	return format.formatBytes(item.size)
}

function barValue(item: UploadItem): number {
	if (item.status === 'done' || item.status === 'checking') return 100
	return item.size ? Math.round((item.loaded / item.size) * 100) : 0
}

function timeLeftLabel(seconds: number): string {
	return seconds < SECONDS_PER_MINUTE
		? t('dms_media.queue.seconds_left', { count: seconds })
		: t('dms_media.queue.minutes_left', { count: Math.ceil(seconds / SECONDS_PER_MINUTE) })
}

async function pickFiles(): Promise<void> {
	tree.value ??= await api.tree().catch(() => null)
	if (!tree.value) return
	uploads.maxUploadBytes.value = tree.value.maxUploadBytes
	const chosen = await destinationDialog.open({ folders: tree.value.folders, initialId: prefs.value.lastFolderId })
	const folder = tree.value.folders.find((entry) => entry.id === chosen)
	if (!folder) return
	update({ lastFolderId: folder.id })
	destination.value = { id: folder.id, name: folder.name }
	fileInput.value?.click()
}

function onFilesChosen(event: Event): void {
	const input = event.target as HTMLInputElement
	const files = Array.from(input.files ?? [])
	if (destination.value && files.length) {
		isBannerDismissed.value = false
		const before = new Set(items.value.map((item) => item.id))
		uploads.enqueue(files, { folderId: destination.value.id, folderName: destination.value.name })
		const added = items.value.filter((item) => !before.has(item.id))
		added.forEach((item, index) => {
			const file = files[index]
			if (file?.type.startsWith('image/')) localPreviews.set(item.id, URL.createObjectURL(file))
		})
	}
	input.value = ''
}

onMounted(() => {
	void api.tree().then((loaded) => (tree.value ??= loaded)).catch(() => undefined)
	if (route.query.pick) {
		void router.replace({ path: route.path, query: {} })
		void pickFiles()
	}
})
onBeforeUnmount(() => localPreviews.forEach((url) => URL.revokeObjectURL(url)))
</script>

<template>
	<div class="flex flex-col gap-4">
		<DmsBanner
			v-if="counts.failed && !isBannerDismissed"
			tone="error"
			icon="i-ph-cloud-slash"
			:title="t('dms_media.queue.failed_title', { count: counts.failed }, counts.failed)"
			:description="t('dms_media.queue.failed_description', { count: counts.done }, counts.done)"
		>
			<template #actions>
				<UButton color="neutral" variant="outline" size="sm" :label="t('dms_media.queue.dismiss')" @click="isBannerDismissed = true" />
				<UButton
					v-if="failedRetryable"
					color="error"
					size="sm"
					icon="i-ph-arrow-clockwise"
					:label="t('dms_media.queue.retry_count', { count: failedRetryable }, failedRetryable)"
					@click="uploads.retryFailed()"
				/>
			</template>
		</DmsBanner>
		<DmsCard v-if="items.length" :title="t('dms_media.queue.current')">
			<template #actions>
				<UBadge v-for="name in destinations" :key="name" icon="i-ph-folder-simple" color="neutral" variant="outline" :label="name" />
				<UButton
					v-if="uploads.activeCount.value"
					:icon="uploads.isPaused.value ? 'i-ph-play' : 'i-ph-pause'"
					color="neutral"
					variant="ghost"
					size="sm"
					:label="uploads.isPaused.value ? t('dms_media.queue.resume') : t('dms_media.queue.pause')"
					@click="uploads.setPaused(!uploads.isPaused.value)"
				/>
				<UButton
					v-if="uploads.activeCount.value"
					icon="i-ph-x"
					color="neutral"
					variant="ghost"
					size="sm"
					:label="t('dms_media.queue.cancel_remaining')"
					@click="uploads.cancelRemaining()"
				/>
				<UButton
					v-else
					icon="i-ph-broom"
					color="neutral"
					variant="ghost"
					size="sm"
					:label="t('dms_media.queue.clear_finished')"
					@click="uploads.clearFinished()"
				/>
			</template>
			<div class="flex flex-col gap-4">
				<div class="flex flex-wrap items-center gap-x-6 gap-y-2">
					<div>
						<p class="text-highlighted text-xl font-semibold">
							{{ counts.done }} <span class="text-muted text-sm font-normal">{{ t('dms_media.queue.of_files', { count: counted.length }) }}</span>
						</p>
						<p class="text-dimmed font-mono text-[11px]">
							{{ format.formatBytes(sentBytes) }} / {{ format.formatBytes(totalBytes) }}
							<template v-if="secondsLeft !== null"> · {{ timeLeftLabel(secondsLeft) }}</template>
							<template v-if="uploads.isPaused.value"> · {{ t('dms_media.queue.paused') }}</template>
						</p>
					</div>
					<UProgress :model-value="progress" size="sm" class="min-w-40 flex-1" />
					<div class="flex flex-wrap gap-3 font-mono text-[11px]">
						<span class="text-success">● {{ t('dms_media.queue.states.done') }} {{ counts.done }}</span>
						<span class="text-primary">● {{ t('dms_media.queue.states.uploading') }} {{ counts.active }}</span>
						<span class="text-dimmed">○ {{ t('dms_media.queue.states.waiting') }} {{ counts.waiting }}</span>
						<span class="text-error">● {{ t('dms_media.queue.states.failed') }} {{ counts.failed }}</span>
					</div>
				</div>
				<ul class="border-default divide-default -mx-4 divide-y border-t">
					<li
						v-for="item in items"
						:key="item.id"
						class="flex items-center gap-3 px-4 py-2.5"
						:class="(item.status === 'failed' || item.status === 'rejected') && 'bg-(--dms-error-tint)'"
					>
						<div class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-(--dms-bg-muted)">
							<img v-if="previewOf(item)" :src="previewOf(item)" alt="" class="size-full object-cover" />
							<UIcon v-else :name="item.mimetype.startsWith('video/') ? 'i-ph-film-strip' : item.mimetype === 'application/pdf' ? 'i-ph-file-pdf' : 'i-ph-file'" class="text-dimmed size-5" />
						</div>
						<div class="min-w-0 flex-1">
							<p class="text-highlighted truncate text-[13px] font-medium">{{ item.name }}</p>
							<p class="truncate text-[12px]" :class="item.status === 'failed' || item.status === 'rejected' ? 'text-error' : 'text-dimmed font-mono'">
								{{ describe(item) }}
							</p>
						</div>
						<div class="flex w-36 flex-col gap-1 max-sm:hidden">
							<UProgress
								:model-value="barValue(item)"
								size="xs"
								:color="item.status === 'done' ? 'success' : item.status === 'failed' || item.status === 'rejected' ? 'error' : 'primary'"
							/>
							<span class="text-dimmed font-mono text-[11px]">{{ sizeLabel(item) }}</span>
						</div>
						<span class="w-24 text-[12px] font-medium" :class="STATUS_TONES[item.status]">
							<UIcon v-if="item.status === 'checking'" name="i-ph-circle-notch" class="me-1 size-3 animate-spin" />
							{{ t(`dms_media.queue.status.${item.status}`) }}
						</span>
						<div class="flex w-20 justify-end">
							<UButton
								v-if="item.status === 'done' && item.asset"
								icon="i-ph-arrow-square-out"
								color="neutral"
								variant="ghost"
								size="xs"
								square
								:to="fileLink(item.asset.id)"
								:aria-label="t('dms_media.actions.open_details')"
							/>
							<UButton
								v-else-if="item.status === 'failed'"
								icon="i-ph-arrow-clockwise"
								color="neutral"
								variant="outline"
								size="xs"
								:label="t('dms_media.actions.retry')"
								@click="uploads.retry(item.id)"
							/>
							<UButton
								v-else-if="item.status === 'rejected' || item.status === 'cancelled'"
								icon="i-ph-x"
								color="neutral"
								variant="ghost"
								size="xs"
								square
								:aria-label="t('dms_media.queue.dismiss')"
								@click="uploads.dismiss(item.id)"
							/>
							<UButton
								v-else
								icon="i-ph-x"
								color="neutral"
								variant="ghost"
								size="xs"
								square
								:aria-label="t('dms_media.queue.cancel')"
								@click="uploads.cancel(item.id)"
							/>
						</div>
					</li>
				</ul>
			</div>
		</DmsCard>
		<DmsEmptyState
			v-else
			icon="i-ph-cloud-arrow-up"
			:title="t('dms_media.queue.empty_title')"
			:description="t('dms_media.queue.empty_description')"
			:actions="canUpload ? [{ label: t('dms_media.actions.upload_files'), icon: 'i-ph-upload-simple', onClick: pickFiles }] : []"
		/>
		<input ref="fileInput" type="file" multiple class="hidden" @change="onFilesChosen" />
	</div>
</template>
