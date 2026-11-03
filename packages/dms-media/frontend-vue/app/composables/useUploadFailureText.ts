import type { UploadFailure, UploadItem } from './useUploadQueue'

const TYPES_SEPARATOR = ', '

export type UploadFailureSource = Pick<
	UploadItem,
	'failure' | 'details' | 'folderName' | 'message' | 'requestError'
>

/** Why a file did not upload, in the member's language, the same wherever it shows. */
export function useUploadFailureText() {
	const uploads = useUploadQueue()
	const format = useMediaFormat()
	const { t } = useI18n()
	const { resolveError } = useApiErrorPresenter()

	function typesLabel(accepted: readonly string[] | undefined): string {
		if (!accepted?.length) return ''
		return fieldTypesLabel(accepted, t) || accepted.join(TYPES_SEPARATOR)
	}

	return function failureText(
		item: UploadFailureSource,
		failure: UploadFailure = item.failure ?? 'server',
	): string {
		const { details, folderName, message } = item
		const params = {
			size: format.formatBytes(
				failure === 'quota'
					? (details?.remaining ?? 0)
					: uploads.maxUploadBytes.value,
			),
			types: typesLabel(details?.accepted),
			name: folderName,
			message: message ?? '',
			address: details?.address ?? '',
		}
		if (item.requestError !== undefined)
			return (
				resolveError(item.requestError, {
					fallbackKey: `dms_media.queue.reason.${failure}`,
					params,
				})?.message ?? ''
			)
		return t(`dms_media.queue.reason.${failure}`, params)
	}
}
