<script setup lang="ts">
import type { UploadItem, UploadStatus } from '../composables/useUploadQueue'
import type { MediaFolder } from '../types/media'
import DestinationDialog from './dialogs/DestinationDialog.vue'
import UploadQueueRow from './uploads/UploadQueueRow.vue'

const uploads = useUploadQueue()
const format = useMediaFormat()
const overlay = useOverlay()
const destinationDialog = overlay.create(DestinationDialog)
const { prefs, update } = useMediaPrefs()
const { tree, refresh: reload, ready } = useLibraryTree()
const toasts = useUploadToasts()
const route = useDmsRoute()
const router = useDmsRouter()
const { t } = useI18n()
// Read with the page: a client navigation waits for the folders, so the drop zone shows with it, saying whether files can go.
await ready()
const canUpload = computed(() => Boolean(tree.value?.folders.some((folder) => folder.rights.write)))
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const destination = ref<MediaFolder | null>(null)
const isBannerDismissed = ref(false)
const isDragging = ref(false)
const SECONDS_PER_MINUTE = 60
const speed = ref(0)
let lastSample = { time: 0, bytes: 0 }
let dragDepth = 0

const FAILED: UploadStatus[] = ['failed', 'rejected']
const items = computed(() => uploads.items.value)
const counts = computed(() => ({
	done: items.value.filter((item) => item.status === 'done').length,
	active: items.value.filter((item) => item.status === 'uploading' || item.status === 'checking').length,
	waiting: items.value.filter((item) => item.status === 'waiting').length,
	failed: items.value.filter((item) => FAILED.includes(item.status)).length,
}))
const counted = computed(() => items.value.filter((item) => item.status !== 'cancelled'))
const sized = computed(() => counted.value.filter((item) => item.status !== 'rejected'))
const totalBytes = computed(() => sized.value.reduce((total, item) => total + item.size, 0))
const sentBytes = computed(() => sized.value.reduce((total, item) => total + sentOf(item), 0))
const hasCancellable = computed(() => items.value.some((item) => item.status === 'waiting' || item.status === 'uploading'))
const progress = computed(() => (totalBytes.value ? Math.round((sentBytes.value / totalBytes.value) * 100) : 0))
const progressColor = computed(() => (counts.value.failed && !uploads.activeCount.value ? 'error' : 'primary'))
const destinations = computed(() => [...new Set(items.value.map((item) => item.folderName))])
const secondsLeft = computed(() =>
	speed.value > 0 && uploads.activeCount.value ? Math.ceil((totalBytes.value - sentBytes.value) / speed.value) : null,
)
const acceptAttribute = computed(() => fileAcceptAttribute(destination.value?.accepts ?? tree.value?.allowedMimetypes))
const failedRetryable = computed(() => items.value.filter((item) => item.status === 'failed').length)
const liveSummary = computed(() =>
	t('dms_media.queue.live_summary', { done: counts.value.done, total: counted.value.length, failed: counts.value.failed }),
)

function sentOf(item: UploadItem): number {
	if (item.status === 'done') return item.size
	if (FAILED.includes(item.status)) return 0
	return item.loaded
}

watch(sentBytes, (bytes) => {
	const now = Date.now()
	if (lastSample.time && now > lastSample.time) {
		const sample = ((bytes - lastSample.bytes) / (now - lastSample.time)) * 1000
		if (sample > 0) speed.value = speed.value ? speed.value * 0.7 + sample * 0.3 : sample
	}
	lastSample = { time: now, bytes }
})

function timeLeftLabel(seconds: number): string {
	return seconds < SECONDS_PER_MINUTE
		? t('dms_media.queue.seconds_left', { count: seconds })
		: t('dms_media.queue.minutes_left', { count: Math.ceil(seconds / SECONDS_PER_MINUTE) })
}

async function chooseFolder(count?: number): Promise<MediaFolder | undefined> {
	await reload()
	const chosen = await destinationDialog.open({
		folders: tree.value?.folders ?? [],
		initialId: prefs.value.lastFolderId,
		count,
	})
	if (chosen && !tree.value?.folders.some((folder) => folder.id === chosen)) await reload()
	const folder = tree.value?.folders.find((entry) => entry.id === chosen)
	if (folder) update({ lastFolderId: folder.id })
	return folder
}

function send(files: File[], folder: MediaFolder): void {
	isBannerDismissed.value = false
	const batchId = uploads.enqueue(files, { folderId: folder.id, folderName: folder.name, accepts: folder.accepts })
	toasts.announce(batchId, files.length, folder.name)
}

async function pickFiles(): Promise<void> {
	const folder = await chooseFolder()
	if (!folder) return
	destination.value = folder
	await nextTick()
	fileInput.value?.click()
}

function onFilesChosen(event: Event): void {
	const input = event.target as HTMLInputElement
	const files = Array.from(input.files ?? [])
	if (destination.value && files.length) send(files, destination.value)
	input.value = ''
}

function hasFiles(event: DragEvent): boolean {
	return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function onDragEnter(event: DragEvent): void {
	if (!hasFiles(event) || !canUpload.value) return
	dragDepth += 1
	isDragging.value = true
}

function onDragLeave(event: DragEvent): void {
	if (!hasFiles(event)) return
	dragDepth = Math.max(dragDepth - 1, 0)
	if (dragDepth === 0) isDragging.value = false
}

function onDragOver(event: DragEvent): void {
	if (hasFiles(event) && canUpload.value) event.preventDefault()
}

async function onDrop(event: DragEvent): Promise<void> {
	dragDepth = 0
	isDragging.value = false
	const files = Array.from(event.dataTransfer?.files ?? [])
	if (!files.length || !canUpload.value) return
	event.preventDefault()
	const folder = await chooseFolder(files.length)
	if (folder) send(files, folder)
}

const DRAG_EVENTS = { dragenter: onDragEnter, dragleave: onDragLeave, dragover: onDragOver, drop: onDrop } as const

onMounted(() => {
	Object.entries(DRAG_EVENTS).forEach(([name, handler]) => window.addEventListener(name, handler as EventListener))
	if (route.query.pick) {
		void router.replace({ path: route.path, query: {} })
		void pickFiles()
	}
})
onBeforeUnmount(() => {
	Object.entries(DRAG_EVENTS).forEach(([name, handler]) => window.removeEventListener(name, handler as EventListener))
})
</script>

<template>
	<div class="relative flex flex-col gap-4">
		<div
			v-if="isDragging"
			class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[var(--dms-radius-card)] border-2 border-dashed border-(--ui-primary) bg-(--dms-accent-tint)"
		>
			<p class="text-highlighted flex items-center gap-2 text-sm font-semibold">
				<UIcon name="i-ph-cloud-arrow-up" class="size-5" />
				{{ t('dms_media.queue.drop_here') }}
			</p>
		</div>
		<p class="sr-only" role="status" aria-live="polite">{{ items.length ? liveSummary : '' }}</p>
		<DmsBanner
			v-if="counts.failed && !isBannerDismissed"
			tone="error"
			icon="i-ph-cloud-slash"
			:title="t('dms_media.queue.failed_title', { count: counts.failed }, counts.failed)"
			:description="counts.done ? t('dms_media.queue.failed_description', { count: counts.done }, counts.done) : undefined"
		>
			<template #actions>
				<UButton color="neutral" variant="outline" size="sm" :label="t('dms_media.queue.dismiss')" @click="isBannerDismissed = true" />
				<UButton color="neutral" variant="outline" size="sm" icon="i-ph-x" :label="t('dms_media.queue.remove_failed')" @click="uploads.clearFailed()" />
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
				<UBadge v-for="name in destinations" :key="name" icon="i-ph-folder-simple" color="neutral" variant="outline" :label="name" class="max-sm:hidden" />
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
					v-if="hasCancellable"
					icon="i-ph-x"
					color="neutral"
					variant="ghost"
					size="sm"
					:label="t('dms_media.queue.cancel_remaining')"
					@click="uploads.cancelRemaining()"
				/>
				<UButton
					v-if="!uploads.activeCount.value"
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
					<UProgress :model-value="progress" :color="progressColor" size="sm" class="min-w-40 flex-1" :get-value-label="(value?: number | null) => `${t('dms_media.queue.overall_progress')}: ${value ?? 0}%`" />
					<div class="flex flex-wrap gap-3 font-mono text-[11px]">
						<span class="text-success"><UIcon name="i-ph-check-circle" class="me-0.5 size-3 align-[-2px]" />{{ t('dms_media.queue.states_added') }} {{ counts.done }}</span>
						<span class="text-primary"><UIcon name="i-ph-arrow-circle-up" class="me-0.5 size-3 align-[-2px]" />{{ t('dms_media.queue.states.uploading') }} {{ counts.active }}</span>
						<span class="text-dimmed"><UIcon name="i-ph-clock" class="me-0.5 size-3 align-[-2px]" />{{ t('dms_media.queue.states.waiting') }} {{ counts.waiting }}</span>
						<span class="text-error"><UIcon name="i-ph-warning-circle" class="me-0.5 size-3 align-[-2px]" />{{ t('dms_media.queue.states.failed') }} {{ counts.failed }}</span>
					</div>
				</div>
				<ul class="border-default divide-default -mx-4 divide-y border-t">
					<UploadQueueRow v-for="item in items" :key="item.id" :item="item" />
				</ul>
			</div>
		</DmsCard>
		<DmsEmptyState
			v-else
			icon="i-ph-cloud-arrow-up"
			:title="t('dms_media.queue.empty_title')"
			:description="canUpload ? t('dms_media.queue.empty_description_drop') : t('dms_media.queue.empty_description')"
		/>
		<input ref="fileInput" type="file" multiple class="hidden" :accept="acceptAttribute || undefined" @change="onFilesChosen" />
	</div>
</template>
