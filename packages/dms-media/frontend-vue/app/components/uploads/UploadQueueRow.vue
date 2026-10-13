<script setup lang="ts">
import type { UploadFailure, UploadItem, UploadStatus } from '../../composables/useUploadQueue'

const props = defineProps<{ item: UploadItem }>()
const uploads = useUploadQueue()
const format = useMediaFormat()
const { t } = useI18n()
const failureText = useUploadFailureText()
const isPreviewBroken = ref(false)

const STATUS_TONES: Record<UploadStatus, string> = {
	waiting: 'text-dimmed',
	uploading: 'text-primary',
	checking: 'text-primary',
	done: 'text-success',
	failed: 'text-error',
	rejected: 'text-error',
	cancelled: 'text-dimmed',
}
const STATUS_LABELS: Record<UploadStatus, string> = {
	waiting: 'dms_media.queue.status.waiting',
	uploading: 'dms_media.queue.status.uploading',
	checking: 'dms_media.queue.status.checking',
	done: 'dms_media.queue.status_added',
	failed: 'dms_media.queue.status.failed',
	rejected: 'dms_media.queue.status.rejected',
	cancelled: 'dms_media.queue.status.cancelled',
}
const BAR_COLORS: Partial<Record<UploadStatus, 'success' | 'error'>> = {
	done: 'success',
	failed: 'error',
	rejected: 'error',
}

const isFailed = computed(() => props.item.status === 'failed' || props.item.status === 'rejected')
const preview = computed(() => (isPreviewBroken.value ? undefined : props.item.previewUrl))
const icon = computed(() => {
	if (props.item.mimetype.startsWith('video/')) return 'i-ph-film-strip'
	if (props.item.mimetype === 'application/pdf') return 'i-ph-file-pdf'
	return 'i-ph-file'
})

watch(
	() => props.item.previewUrl,
	() => (isPreviewBroken.value = false),
)

function reasonOf(failure: UploadFailure | undefined): string {
	return failureText(props.item, failure)
}

const detail = computed(() => {
	const { item } = props
	if (isFailed.value) return reasonOf(item.failure)
	if (item.status === 'cancelled')
		return item.failure === 'duplicate' ? reasonOf('duplicate') : t('dms_media.queue.cancelled_detail', { name: item.folderName })
	if (item.status === 'done' && item.asset?.width)
		return `${format.formatDimensions(item.asset.width, item.asset.height)} · ${t('dms_media.queue.added', { name: item.folderName })}`
	if (item.status === 'done') return t('dms_media.queue.added', { name: item.folderName })
	if (item.status === 'checking') return t('dms_media.queue.checking_file')
	if (item.status === 'uploading') return t('dms_media.queue.uploading_to', { name: item.folderName })
	return t('dms_media.queue.waiting_detail', { name: item.folderName })
})

const sizeLabel = computed(() =>
	props.item.status === 'uploading'
		? `${format.formatBytes(props.item.loaded)} / ${format.formatBytes(props.item.size)}`
		: format.formatBytes(props.item.size),
)

const barValue = computed(() => {
	const { item } = props
	if (item.status === 'done' || item.status === 'checking') return 100
	return item.size ? Math.round((item.loaded / item.size) * 100) : 0
})

const canCancel = computed(() => props.item.status === 'waiting' || props.item.status === 'uploading')
const canRemove = computed(() => isFailed.value || props.item.status === 'cancelled')
</script>

<template>
	<li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5" :class="isFailed && 'bg-(--dms-error-tint)'">
		<div class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-(--dms-bg-muted)">
			<img v-if="preview" :src="preview" alt="" class="size-full object-cover" @error="isPreviewBroken = true" />
			<UIcon v-else :name="icon" class="text-dimmed size-5" />
		</div>
		<div class="min-w-0 flex-1 max-sm:basis-[calc(100%-3.25rem)]">
			<p class="text-highlighted truncate text-[13px] font-medium max-sm:whitespace-normal max-sm:break-all">{{ item.name }}</p>
			<p class="text-[12px] sm:truncate" :class="isFailed ? 'text-error' : 'text-dimmed font-mono'">
				{{ detail }}
			</p>
		</div>
		<div class="flex w-36 flex-col gap-1 max-sm:order-last max-sm:w-full max-sm:ps-13">
			<UProgress
				:model-value="barValue"
				size="xs"
				:color="BAR_COLORS[item.status] ?? 'primary'"
				:get-value-label="(value?: number | null) => `${t('dms_media.queue.progress_of', { name: item.name })}: ${value ?? 0}%`"
			/>
			<span class="text-dimmed font-mono text-[11px] max-sm:hidden">{{ sizeLabel }}</span>
		</div>
		<span class="w-24 text-[12px] font-medium max-sm:ms-13 max-sm:w-auto" :class="STATUS_TONES[item.status]">
			<UIcon v-if="item.status === 'checking'" name="i-ph-circle-notch" class="me-1 size-3 animate-spin" />
			{{ t(STATUS_LABELS[item.status]) }}
		</span>
		<div class="flex w-20 justify-end gap-1 max-sm:ms-auto max-sm:w-auto">
			<UButton
				v-if="item.status === 'done' && item.asset"
				icon="i-ph-arrow-square-out"
				color="neutral"
				variant="ghost"
				size="xs"
				square
				:to="fileLink(item.asset.id)"
				:aria-label="t('dms_media.queue.open_named', { name: item.name })"
			/>
			<UButton
				v-if="item.status === 'failed'"
				icon="i-ph-arrow-clockwise"
				color="neutral"
				variant="outline"
				size="xs"
				:label="t('dms_media.actions.retry')"
				:aria-label="t('dms_media.queue.retry_named', { name: item.name })"
				@click="uploads.retry(item.id)"
			/>
			<UButton
				v-if="canRemove"
				icon="i-ph-x"
				color="neutral"
				variant="ghost"
				size="xs"
				square
				:aria-label="t('dms_media.queue.remove_named', { name: item.name })"
				@click="uploads.dismiss(item.id)"
			/>
			<UButton
				v-if="canCancel"
				icon="i-ph-x"
				color="neutral"
				variant="ghost"
				size="xs"
				square
				:aria-label="t('dms_media.queue.cancel_named', { name: item.name })"
				@click="uploads.cancel(item.id)"
			/>
		</div>
	</li>
</template>
