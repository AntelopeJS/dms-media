import type {
	AccessSubjects,
	AclEntry,
	ActivityEntry,
	AssetDetails,
	AssetPage,
	AssetVisibility,
	BulkOutcome,
	FolderAccessSummary,
	FolderImpact,
	FolderVisibility,
	LinkedFolderDetail,
	ListingParams,
	MediaAsset,
	MediaTree,
	PresetsResponse,
	PresignResponse,
	SearchParams,
	SmartView,
} from '../types/media'

const API = '/api/media'

export interface AssetChanges {
	name?: string
	alt?: string
}

export interface CropRegion {
	x: number
	y: number
	width: number
	height: number
}

export interface TransformOperations {
	crop?: CropRegion
	rotate?: number
}

export interface BatchSummary {
	batchId: string
	folderId: string
	total: number
	uploaded: number
	failed: number
	size: number
}

export interface StarterFolder {
	name: string
	visibility: FolderVisibility
}

export interface ReadUrl {
	url: string
	expiresAt: number
}

/** Typed calls to the media API, through the authenticated DMS fetch. */
export function useMediaApi() {
	const { $authFetch } = useAuthFetch()
	const post = <T>(path: string, body?: object) =>
		$authFetch<T>(`${API}${path}`, { method: 'POST', body })

	return {
		tree: () => $authFetch<MediaTree>(`${API}/tree`),
		folderAssets: (folderId: string, query: ListingParams = {}) =>
			$authFetch<AssetPage>(`${API}/folders/${folderId}/assets`, { query }),
		smartView: (view: SmartView, query: ListingParams = {}) =>
			$authFetch<AssetPage>(`${API}/views/${view}`, { query }),
		search: (query: SearchParams) =>
			$authFetch<AssetPage>(`${API}/search`, { query }),
		asset: (assetId: string) =>
			$authFetch<{ asset: MediaAsset }>(`${API}/assets/${assetId}`),
		details: (assetId: string) =>
			$authFetch<AssetDetails>(`${API}/assets/${assetId}/details`),
		history: (assetId: string) =>
			$authFetch<{ items: ActivityEntry[] }>(
				`${API}/assets/${assetId}/history`,
			),
		previews: (ids: string[]) =>
			post<{ previews: Record<string, string> }>('/previews', { ids }),
		readUrl: (assetId: string, preset?: string) =>
			$authFetch<ReadUrl>(`${API}/assets/${assetId}/read-url`, {
				query: preset ? { preset } : {},
			}),
		recent: () => $authFetch<{ assets: MediaAsset[] }>(`${API}/stats/recent`),
		createFolder: (name: string, parentId?: string) =>
			post<{ id: string }>('/folders', { name, parentId }),
		createStarterFolders: (folders: StarterFolder[]) =>
			post<{ ids: string[] }>('/folders/starter', { folders }),
		renameFolder: (folderId: string, name: string) =>
			post(`/folders/${folderId}/rename`, { name }),
		moveFolder: (folderId: string, parentId: string | null) =>
			post(`/folders/${folderId}/move`, { parentId }),
		setFolderVisibility: (folderId: string, visibility: FolderVisibility) =>
			post(`/folders/${folderId}/visibility`, { visibility }),
		folderImpact: (folderId: string) =>
			$authFetch<FolderImpact>(`${API}/folders/${folderId}/impact`),
		deleteFolder: (folderId: string) =>
			$authFetch(`${API}/folders/${folderId}`, { method: 'DELETE' }),
		folderAccess: (folderId: string) =>
			$authFetch<FolderAccessSummary>(`${API}/folders/${folderId}/access`),
		setFolderAcl: (folderId: string, entries: AclEntry[] | null) =>
			$authFetch(`${API}/folders/${folderId}/acl`, {
				method: 'PUT',
				body: { entries },
			}),
		accessSubjects: () => $authFetch<AccessSubjects>(`${API}/access/subjects`),
		updateAsset: (assetId: string, changes: AssetChanges) =>
			post(`/assets/${assetId}/update`, changes),
		moveAssets: (ids: string[], folderId: string) =>
			post<BulkOutcome>('/assets/bulk/move', { ids, folderId }),
		setAssetsVisibility: (ids: string[], visibility: AssetVisibility) =>
			post<BulkOutcome>('/assets/bulk/visibility', { ids, visibility }),
		deleteAssets: (ids: string[]) =>
			post<BulkOutcome>('/assets/bulk/delete', { ids }),
		zip: (ids: string[]) =>
			$authFetch<Blob, 'blob'>(`${API}/assets/zip`, {
				method: 'POST',
				body: { ids },
				responseType: 'blob',
			}),
		transform: (assetId: string, operations: TransformOperations) =>
			post<{ asset: MediaAsset }>(`/assets/${assetId}/transform`, operations),
		revert: (assetId: string) =>
			post<{ asset: MediaAsset }>(`/assets/${assetId}/revert`),
		star: (kind: 'asset' | 'folder', targetId: string, starred: boolean) =>
			post('/favorites', { kind, targetId, starred }),
		presign: (folderId: string, file: File) =>
			post<PresignResponse>('/upload/presign', {
				folderId,
				filename: file.name,
				size: file.size,
				mimetype: file.type || 'application/octet-stream',
			}),
		confirmUpload: (
			folderId: string,
			resourceKey: string,
			filename: string,
			batchId: string,
		) =>
			post<{ asset: MediaAsset }>('/upload/confirm', {
				folderId,
				resourceKey,
				filename,
				batchId,
			}),
		reportBatch: (summary: BatchSummary) => post('/upload/batches', summary),
		linkedDetail: (bindingId: string) =>
			$authFetch<LinkedFolderDetail>(
				`${API}/linked/${encodeURIComponent(bindingId)}`,
			),
		presets: () => $authFetch<PresetsResponse>(`${API}/presets`),
	}
}

export type MediaApi = ReturnType<typeof useMediaApi>
