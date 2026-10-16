const DEFAULT_MAX_UPLOAD_BYTES = 500 * 1024 * 1024

/** What the library takes at all, from the module config: every upload is checked against it before it is sent. */
export interface UploadLimits {
	maxUploadBytes: number
	/** Mimetype patterns the library accepts; any type until the server says otherwise. */
	allowedMimetypes: readonly string[] | null
}

const limits = ref<UploadLimits>({
	maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
	allowedMimetypes: null,
})

/** The upload limits the server last sent, shared by every screen that uploads. */
export const uploadLimits = readonly(limits)

/** Keeps the upload limits a server answer carries: browser state, which a server render leaves alone. */
export function rememberUploadLimits(answer: UploadLimits): void {
	if (import.meta.env.SSR) return
	limits.value = {
		maxUploadBytes: answer.maxUploadBytes,
		allowedMimetypes: answer.allowedMimetypes,
	}
}
