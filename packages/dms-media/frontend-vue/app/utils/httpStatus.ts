const OUT_OF_REACH_STATUSES = new Set([HTTP_FORBIDDEN, HTTP_NOT_FOUND]);

/** What a failed request threw, as the DMS reads an API error's status from it. */
export type RequestError = Parameters<typeof apiErrorStatus>[0];

/** The file or folder a request named no longer exists: someone deleted it meanwhile. */
export function isNotFoundError(error: RequestError): boolean {
  return apiErrorStatus(error) === HTTP_NOT_FOUND;
}

/** The file or folder a request named is gone, or the reader may no longer open it. */
export function isOutOfReachError(error: RequestError): boolean {
  return OUT_OF_REACH_STATUSES.has(apiErrorStatus(error) ?? 0);
}
