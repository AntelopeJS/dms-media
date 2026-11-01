import type { MediaAsset, PresignResponse } from '../types/media'

const API = '/api/media/upload'

export interface UploadFailureReport {
	name: string
	reason: string
}

export interface UploadBatchReport {
	batchId: string
	folderId: string
	total: number
	uploaded: number
	failed: number
	size: number
	failures: UploadFailureReport[]
}

export interface ConfirmRequest {
	folderId: string
	resourceKey: string
	filename: string
	batchId: string
}

interface RequestOptions {
	keepalive?: boolean
}

/** The upload routes the queue drives: presign, confirm, abort, names and batch reports. */
export function useUploadApi() {
	const { $authFetch } = useAuthFetch()
	const post = <T>(path: string, body: object) =>
		$authFetch<T>(`${API}${path}`, { method: 'POST', body })

	return {
		presign: (folderId: string, file: File) =>
			post<PresignResponse>('/presign', {
				folderId,
				filename: file.name,
				size: file.size,
				mimetype: file.type || 'application/octet-stream',
			}),
		confirm: (request: ConfirmRequest) => post<{ asset: MediaAsset }>('/confirm', request),
		abort: (folderId: string, resourceKey: string) =>
			$authFetch(`${API}/abort`, { method: 'POST', body: { folderId, resourceKey }, onResponseError: () => undefined }),
		freeNames: (folderId: string, filenames: string[]) =>
			post<{ names: (string | null)[] }>('/names', { folderId, filenames }),
		reportBatch: (report: UploadBatchReport, options?: RequestOptions) =>
			$authFetch(`${API}/batches`, { method: 'POST', body: report, ...options, onResponseError: () => undefined }),
	}
}
