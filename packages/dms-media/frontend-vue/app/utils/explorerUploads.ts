import type { UploadItem, UploadStatus } from '../composables/useUploadQueue'

const SETTLED_STATUSES = new Set<UploadStatus>(['done', 'failed', 'rejected', 'cancelled'])

export interface UploadProgress {
	done: number
	total: number
}

function isSettledUpload(item: UploadItem): boolean {
	return SETTLED_STATUSES.has(item.status)
}

/**
 * Progress of the batches still running, so a finished batch does not add to
 * the next one ("3 of 5" for 2 files).
 */
export function runningUploadProgress(items: readonly UploadItem[]): UploadProgress {
	return batchesProgress(items, runningBatchIds(items))
}

/** Files added out of those kept, over the given batches. */
export function batchesProgress(items: readonly UploadItem[], batchIds: ReadonlySet<string>): UploadProgress {
	const batch = items.filter((item) => batchIds.has(item.batchId) && item.status !== 'cancelled')
	return { done: batch.filter((item) => item.status === 'done').length, total: batch.length }
}

export function runningBatchIds(items: readonly UploadItem[]): Set<string> {
	return new Set(items.filter((item) => !isSettledUpload(item)).map((item) => item.batchId))
}
