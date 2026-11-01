import type { UploadFailureSource } from './useUploadFailureText'
import type { UploadBatchOutcome, UploadItem } from './useUploadQueue'

type ToastApi = ReturnType<typeof useToast>
type Translate = ReturnType<typeof useI18n>['t']

interface Announcer {
	toast: ToastApi
	presentError: ReturnType<typeof useApiErrorPresenter>['presentError']
	t: Translate
	failureText: (item: UploadFailureSource) => string
	failedItems: (batchId: string) => readonly UploadItem[]
	showUploadsLink: boolean
}

export interface UploadToastOptions {
	/**
	 * Offer the module's Uploads page from the toasts. Off outside the module
	 * pages (a project form's picker): following it would leave the form for a
	 * page members cannot open.
	 */
	showUploadsLink?: boolean
}

const FAILED_STATUSES = new Set<UploadItem['status']>(['failed', 'rejected'])
const NAMES_SEPARATOR = ', '
const announcers = new Map<string, Announcer>()
let isListening = false

function toastId(batchId: string): string {
	return `dms-media-upload-${batchId}`
}

function uploadsLink(announcer: Announcer, labelKey: string) {
	if (!announcer.showUploadsLink) return undefined
	return [
		{
			label: announcer.t(labelKey),
			onClick: () => void navigateDms(MEDIA_ROUTES.uploads),
		},
	]
}

/** The reason most of the failed files share, or "various reasons" on a tie. */
function sharedReason(
	announcer: Announcer,
	failed: readonly UploadItem[],
): string {
	const counts = new Map<string, number>()
	for (const item of failed) {
		const reason = announcer.failureText(item)
		counts.set(reason, (counts.get(reason) ?? 0) + 1)
	}
	const ranked = [...counts].sort((left, right) => right[1] - left[1])
	const [top, runnerUp] = ranked
	if (!top || (runnerUp && runnerUp[1] === top[1]))
		return announcer.t('dms_media.toasts.upload_failed_mixed')
	return top[0]
}

function failureToast(announcer: Announcer, outcome: UploadBatchOutcome) {
	const { t } = announcer
	const failed = announcer
		.failedItems(outcome.batchId)
		.filter((item) => item.requestError === undefined)
	const [only] = failed
	const added = outcome.uploaded
		? t(
				'dms_media.toasts.upload_added',
				{ count: outcome.uploaded, name: outcome.folderName },
				outcome.uploaded,
			)
		: ''
	const title =
		failed.length === 1 && only
			? t('dms_media.toasts.upload_failed_one', { name: only.name })
			: t(
					'dms_media.toasts.upload_failed',
					{ count: failed.length, name: outcome.folderName },
					failed.length,
				)
	const reason =
		failed.length === 1 && only
			? announcer.failureText(only)
			: sharedReason(announcer, failed)
	return { title, description: [reason, added].filter(Boolean).join(' · ') }
}

function settle(outcome: UploadBatchOutcome): void {
	const announcer = announcers.get(outcome.batchId)
	if (!announcer) return
	announcers.delete(outcome.batchId)
	const { toast, t } = announcer
	toast.remove(toastId(outcome.batchId))
	const failed = announcer.failedItems(outcome.batchId)
	for (const item of failed) {
		if (item.requestError === undefined) continue
		announcer.presentError(item.requestError, {
			fallbackKey: 'dms_media.toasts.upload_failed_one',
			params: { name: item.name },
			actions: announcer.showUploadsLink
				? [
						{
							labelKey: 'dms_media.upload_strip.see_details',
							onSelect: () => navigateDms(MEDIA_ROUTES.uploads),
						},
					]
				: undefined,
		})
	}
	if (failed.some((item) => item.requestError === undefined))
		return void toast.add({
			...failureToast(announcer, outcome),
			icon: 'i-ph-cloud-slash',
			color: 'error',
			actions: uploadsLink(announcer, 'dms_media.upload_strip.see_details'),
		})
	if (!outcome.uploaded) return
	toast.add({
		title: t(
			'dms_media.toasts.upload_added',
			{ count: outcome.uploaded, name: outcome.folderName },
			outcome.uploaded,
		),
		icon: 'i-ph-check-circle',
		color: 'success',
	})
}

/**
 * Shows batch progress, then request failures through the API presenter and
 * local validation or success notices once every file settles, even after
 * the page that started the batch was left.
 */
export function useUploadToasts() {
	const toast = useToast()
	const { presentError } = useApiErrorPresenter()
	const { t } = useI18n()
	const uploads = useUploadQueue()
	const failureText = useUploadFailureText()
	if (!isListening) {
		isListening = true
		uploads.onBatchSettled(settle)
	}

	function announce(
		batchId: string,
		count: number,
		folderName: string,
		options: UploadToastOptions = {},
	): void {
		const announcer: Announcer = {
			toast,
			presentError,
			t,
			failureText,
			failedItems: (id) =>
				uploads.items.value.filter(
					(item) => item.batchId === id && FAILED_STATUSES.has(item.status),
				),
			showUploadsLink: options.showUploadsLink ?? true,
		}
		announcers.set(batchId, announcer)
		toast.add({
			id: toastId(batchId),
			title: t(
				'dms_media.toasts.uploading',
				{ count, name: folderName },
				count,
			),
			icon: 'i-ph-cloud-arrow-up',
			color: 'neutral',
			actions: uploadsLink(announcer, 'dms_media.upload_strip.see_progress'),
		})
	}

	/** Names the files a field refused for their type, and says what it takes. */
	function announceRefusedTypes(
		refused: readonly File[],
		accept: readonly string[],
	): void {
		if (refused.length === 0) return
		const types = fieldTypesLabel(accept, t)
		toast.add({
			title: t(
				'dms_media.field_widget.upload.type_refused',
				{ names: refused.map((file) => file.name).join(NAMES_SEPARATOR) },
				refused.length,
			),
			description: types
				? t('dms_media.field_widget.upload.accepts', { types })
				: undefined,
			color: 'warning',
			icon: 'i-ph-file-x',
		})
	}

	return { announce, announceRefusedTypes }
}
