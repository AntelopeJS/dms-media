import type { MediaAsset } from '../types/media'
import type { FileSplit, UploadDestination, UploadItem } from './useUploadQueue'

const HIDDEN_STATUSES = new Set<UploadItem['status']>(['done', 'cancelled'])
const FAILED_STATUSES = new Set<UploadItem['status']>(['failed', 'rejected'])
const NAMES_SEPARATOR = ', '

export interface AssetFieldUploadOptions {
	/** Mimetype patterns the field accepts; every file when empty. */
	accept: () => string[] | undefined
	/** Where the field's uploads go, or nothing when it has no folder to upload to. */
	destination: () => UploadDestination | null
	/** How many more files the field takes; no limit when undefined. */
	room: () => number | undefined
	/** Gives the field a file once it is uploaded. */
	onUploaded: (asset: MediaAsset) => void
}

function namesOf(files: File[]): string {
	return files.map((file) => file.name).join(NAMES_SEPARATOR)
}

/**
 * The uploads of one asset field: files it cannot take are refused with a
 * message, the others go through the shared queue, and their progress and
 * failures stay listed under the field until they settle.
 */
export function useAssetFieldUploads(options: AssetFieldUploadOptions) {
	const uploads = useUploadQueue()
	const uploadToasts = useUploadToasts()
	const toast = useToast()
	const { t } = useI18n()
	const { presentError } = useApiErrorPresenter()
	const batchIds = ref<string[]>([])
	const reportedFailures = new Set<string>()

	const items = computed(() =>
		uploads.items.value.filter(
			(item) =>
				batchIds.value.includes(item.batchId) &&
				!HIDDEN_STATUSES.has(item.status),
		),
	)
	const isUploading = computed(() =>
		items.value.some((item) => !FAILED_STATUSES.has(item.status)),
	)

	function splitByRoom(files: File[]): FileSplit {
		const room = options.room()
		if (room === undefined || files.length <= room)
			return { kept: files, refused: [] }
		const kept = files.slice(0, room)
		const refused = files.slice(room)
		toast.add({
			title: t(
				'dms_media.field_widget.upload.over_max',
				{ names: namesOf(refused) },
				refused.length,
			),
			description: t(
				'dms_media.field_widget.upload.room',
				{ count: room },
				room,
			),
			color: 'warning',
			icon: 'i-ph-stack',
		})
		return { kept, refused }
	}

	async function upload(files: File[]): Promise<void> {
		const destination = options.destination()
		if (files.length === 0) return
		if (!destination) {
			toast.add({
				title: t('dms_media.field_widget.drop.no_folder'),
				color: 'warning',
				icon: 'i-ph-folder-simple',
			})
			return
		}
		const accept = options.accept() ?? []
		const byType = uploads.splitByFieldType(files, accept)
		uploadToasts.announceRefusedTypes(byType.refused, accept)
		const { kept } = splitByRoom(byType.kept)
		if (kept.length === 0) return
		const batchId = await uploads.enqueue(kept, destination)
		if (batchId) batchIds.value = [...batchIds.value, batchId]
	}

	/** Why a file failed, worded as the upload queue and its toasts word it. */
	const failureText = useUploadFailureText()

	function reportFailures(list: UploadItem[]): void {
		for (const item of list.filter(
			(entry) =>
				FAILED_STATUSES.has(entry.status) && !reportedFailures.has(entry.id),
		)) {
			reportedFailures.add(item.id)
			if (item.requestError !== undefined) {
				presentError(item.requestError, {
					fallbackKey: 'dms_media.field_widget.upload.failed',
					params: { name: item.name },
				})
				continue
			}
			toast.add({
				title: t('dms_media.field_widget.upload.failed', { name: item.name }),
				description: failureText(item),
				color: 'error',
				icon: 'i-ph-warning-circle',
			})
		}
	}

	watch(items, reportFailures)

	const stopListening = uploads.onUploaded((asset) => {
		const isOurs = uploads.items.value.some(
			(item) =>
				batchIds.value.includes(item.batchId) && item.asset?.id === asset.id,
		)
		if (isOurs) options.onUploaded(asset)
	})
	onBeforeUnmount(stopListening)

	return {
		items,
		isUploading,
		upload,
		failureText,
		isFailed: (item: UploadItem) => FAILED_STATUSES.has(item.status),
		retry: uploads.retry,
		cancel: uploads.cancel,
		dismiss: uploads.dismiss,
	}
}
