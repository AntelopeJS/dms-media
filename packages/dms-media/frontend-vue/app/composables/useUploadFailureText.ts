import type { UploadFailure, UploadItem } from './useUploadQueue'

const TYPES_SEPARATOR = ', '

export type UploadFailureSource = Pick<UploadItem, 'failure' | 'details' | 'folderName' | 'message'>

/** Why a file did not upload, in the member's language, the same wherever it shows. */
export function useUploadFailureText() {
	const uploads = useUploadQueue()
	const format = useMediaFormat()
	const { t } = useI18n()

	function typesLabel(accepted: readonly string[] | undefined): string {
		if (!accepted?.length) return ''
		return fieldTypesLabel(accepted, t) || accepted.join(TYPES_SEPARATOR)
	}

	return function failureText(item: UploadFailureSource, failure: UploadFailure = item.failure ?? 'server'): string {
		const { details, folderName, message } = item
		return t(`dms_media.queue.reason.${failure}`, {
			size: format.formatBytes(failure === 'quota' ? (details?.remaining ?? 0) : uploads.maxUploadBytes.value),
			types: typesLabel(details?.accepted),
			name: folderName,
			message: message ?? '',
			address: details?.address ?? '',
		})
	}
}
