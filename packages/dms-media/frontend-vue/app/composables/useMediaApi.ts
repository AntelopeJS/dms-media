import type {
	AssetDetails,
	AssetPage,
	AssetVisibility,
	BulkOutcome,
	FolderImpact,
	FolderVisibility,
	ListingParams,
	MediaAsset,
	MediaTree,
	SearchParams,
	SmartView,
} from '../types/media'

const API = '/api/media'
/** Most ids one bulk request carries, as the API validates it. */
const BULK_CHUNK_SIZE = 500

function chunkIds(ids: string[]): string[][] {
	const chunks: string[][] = []
	for (let start = 0; start < ids.length; start += BULK_CHUNK_SIZE)
		chunks.push(ids.slice(start, start + BULK_CHUNK_SIZE))
	return chunks
}

/** Sends a bulk action in API-sized chunks, one after the other, and merges the outcomes. */
async function inChunks(ids: string[], send: (chunk: string[]) => Promise<BulkOutcome>): Promise<BulkOutcome> {
	const merged: BulkOutcome = { done: [], refused: [] }
	for (const chunk of chunkIds(ids)) {
		const outcome = await send(chunk)
		merged.done.push(...outcome.done)
		merged.refused.push(...outcome.refused)
	}
	return merged
}

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

export interface StarterFolder {
	name: string
	visibility: FolderVisibility
}

export interface ReadUrl {
	url: string
	expiresAt: number
}

/** The URLs of the reads the pages render, which `useApiData` reads and shares by URL. */
export const MEDIA_READS = {
	tree: `${API}/tree`,
	recent: `${API}/stats/recent`,
	presets: `${API}/presets`,
	boundFolder: (bindingId: string) => `${API}/bindings/${encodeURIComponent(bindingId)}/folder`,
	asset: (assetId: string) => `${API}/assets/${assetId}`,
	details: (assetId: string) => `${API}/assets/${assetId}/details`,
	readUrl: (assetId: string) => `${API}/assets/${assetId}/read-url`,
	folderAssets: (folderId: string) => `${API}/folders/${folderId}/assets`,
} as const

/** Typed calls to the media API, through the authenticated DMS fetch: the writes, and the reads the explorer, the dialogs and the viewers make themselves. */
export function useMediaApi() {
	const { $authFetch } = useAuthFetch()
	const post = <T>(path: string, body?: object) =>
		$authFetch<T>(`${API}${path}`, { method: 'POST', body })

	return {
		tree: (scopeFolderId?: string) =>
			$authFetch<MediaTree>(MEDIA_READS.tree, { query: scopeFolderId ? { folderId: scopeFolderId } : {} }),
		folderAssets: (folderId: string, query: ListingParams = {}) =>
			$authFetch<AssetPage>(MEDIA_READS.folderAssets(folderId), { query }),
		smartView: (view: SmartView, query: ListingParams = {}) =>
			$authFetch<AssetPage>(`${API}/views/${view}`, { query }),
		search: (query: SearchParams) =>
			$authFetch<AssetPage>(`${API}/search`, { query }),
		asset: (assetId: string) => $authFetch<{ asset: MediaAsset }>(MEDIA_READS.asset(assetId)),
		details: (assetId: string) => $authFetch<AssetDetails>(MEDIA_READS.details(assetId)),
		previews: (ids: string[]) =>
			post<{ previews: Record<string, string> }>('/previews', { ids }),
		readUrl: (assetId: string, preset?: string) =>
			$authFetch<ReadUrl>(MEDIA_READS.readUrl(assetId), {
				query: preset ? { preset } : {},
			}),
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
		updateAsset: (assetId: string, changes: AssetChanges) =>
			post(`/assets/${assetId}/update`, changes),
		moveAssets: (ids: string[], folderId: string) =>
			inChunks(ids, (chunk) => post<BulkOutcome>('/assets/bulk/move', { ids: chunk, folderId })),
		setAssetsVisibility: (ids: string[], visibility: AssetVisibility) =>
			inChunks(ids, (chunk) => post<BulkOutcome>('/assets/bulk/visibility', { ids: chunk, visibility })),
		deleteAssets: (ids: string[]) =>
			inChunks(ids, (chunk) => post<BulkOutcome>('/assets/bulk/delete', { ids: chunk })),
		zip: (ids: string[]) =>
			$authFetch<Blob, 'blob'>(`${API}/assets/zip`, {
				method: 'POST',
				body: { ids },
				responseType: 'blob',
			}),
		zipFolder: (folderId: string) =>
			$authFetch<Blob, 'blob'>(`${API}/folders/${folderId}/zip`, {
				method: 'POST',
				responseType: 'blob',
			}),
		transform: (assetId: string, operations: TransformOperations) =>
			post<{ asset: MediaAsset }>(`/assets/${assetId}/transform`, operations),
		transformCopy: (assetId: string, operations: TransformOperations) =>
			post<{ asset: MediaAsset }>(`/assets/${assetId}/transform/copy`, operations),
		revert: (assetId: string) =>
			post<{ asset: MediaAsset }>(`/assets/${assetId}/revert`),
		star: (kind: 'asset' | 'folder', targetId: string, starred: boolean) =>
			post('/favorites', { kind, targetId, starred }),
	}
}

export type MediaApi = ReturnType<typeof useMediaApi>
