const OUT_OF_REACH_STATUSES = new Set([HTTP_FORBIDDEN, HTTP_NOT_FOUND])

/** The file or folder a request named no longer exists: someone deleted it meanwhile. */
export function isNotFoundError(error: unknown): boolean {
	return apiErrorStatus(error) === HTTP_NOT_FOUND
}

/** The file or folder a request named is gone, or the reader may no longer open it. */
export function isOutOfReachError(error: unknown): boolean {
	return OUT_OF_REACH_STATUSES.has(apiErrorStatus(error) ?? 0)
}
