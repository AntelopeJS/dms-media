import type { BulkRefusal } from '../../types/media'

const HTTP_NOT_FOUND = 404
const API_KEY_PREFIX = '$'
const ERRORS = '$dms_media.errors'
const NAME_FIELD_ERRORS = new Set(
	['name_required', 'name_too_long', 'name_forbidden', 'name_taken', 'folder_name_taken'].map(
		(code) => `${ERRORS}.${code}`,
	),
)

interface ApiFailure {
	status?: number
	statusCode?: number
	data?: unknown
}

interface ApiErrorBody {
	message?: unknown
}

type Translate = (key: string) => string

function asFailure(error: unknown): ApiFailure {
	return typeof error === 'object' && error !== null ? (error as ApiFailure) : {}
}

/** The message the API answered with: an i18n key (`$dms_media.errors.…`) or plain text. */
function apiErrorMessage(error: unknown): string | undefined {
	const data = asFailure(error).data
	if (typeof data === 'string') return data
	const message = (data as ApiErrorBody | undefined)?.message
	return typeof message === 'string' ? message : undefined
}

/** The file or folder no longer exists: someone deleted it meanwhile. */
export function isGoneError(error: unknown): boolean {
	const failure = asFailure(error)
	return (failure.statusCode ?? failure.status) === HTTP_NOT_FOUND
}

export function isGoneRefusal(refusal: BulkRefusal): boolean {
	return refusal.status === HTTP_NOT_FOUND
}

/** An API message in the reader's language when it is an i18n key, as is otherwise. */
export function translateApiMessage(t: Translate, message: string | undefined): string | undefined {
	if (!message?.startsWith(API_KEY_PREFIX)) return message
	return t(message.slice(API_KEY_PREFIX.length))
}

/** A refusal about the typed name, shown under the name field instead of a toast. */
export function nameFieldError(t: Translate, error: unknown): string | undefined {
	const message = apiErrorMessage(error)
	return message && NAME_FIELD_ERRORS.has(message) ? translateApiMessage(t, message) : undefined
}
