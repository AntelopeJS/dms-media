<script setup lang="ts">
import { useDebounceFn, useThrottleFn } from '@vueuse/core'

const { library } = useExplorerContext()
const uploads = useUploadQueue()
const { t } = useI18n()
const message = ref('')
const SELECTION_SETTLE_MS = 400
const UPLOAD_ANNOUNCE_MS = 5000
const FINISHED_CLEAR_MS = 8000

const selectedCount = computed(() => library.selection.selectedIds.value.size)
const uploadProgress = computed(() => runningUploadProgress(uploads.items.value))

watch(
	() => library.listing.isLoading.value,
	(isLoading) => {
		const location = library.listing.location.value
		if (isLoading || location.kind !== 'search' || library.listing.error.value) return
		const count = library.listing.total.value
		message.value = t('dms_media.status.results', { count, query: location.query }, count)
	},
)

const announceSelection = useDebounceFn((count: number) => {
	if (count > 0) message.value = t('dms_media.status.selected', { count }, count)
}, SELECTION_SETTLE_MS)
watch(selectedCount, (count) => void announceSelection(count))

const announceUploads = useThrottleFn(
	() => {
		const { done, total } = uploadProgress.value
		if (total > 0) message.value = t('dms_media.status.uploading', { done, total })
	},
	UPLOAD_ANNOUNCE_MS,
	true,
)
watch(() => uploadProgress.value.done, () => void announceUploads())

/** The end of the last batches is said once, then the region empties so it does not linger. */
const clearSoon = useDebounceFn(() => {
	message.value = ''
}, FINISHED_CLEAR_MS)
let announcedBatchIds = new Set<string>()
watch(
	() => runningBatchIds(uploads.items.value),
	(running) => {
		if (running.size > 0) {
			announcedBatchIds = new Set([...announcedBatchIds, ...running])
			return
		}
		if (announcedBatchIds.size === 0) return
		const { done, total } = batchesProgress(uploads.items.value, announcedBatchIds)
		announcedBatchIds = new Set()
		message.value = t('dms_media.status.uploads_finished', { done, total })
		void clearSoon()
	},
)
</script>

<template>
	<p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ message }}</p>
</template>
