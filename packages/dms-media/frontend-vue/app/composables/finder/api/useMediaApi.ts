export interface MediaFolderRightsDto {
	read: boolean;
	write: boolean;
	manage: boolean;
}

export interface MediaFolderDto {
	id: string;
	name: string;
	parentId: string | null;
	shell: boolean;
	bound: boolean;
	binding: string | null;
	visibility: "private" | "public";
	hasOwnAcl: boolean;
	createdAt: string;
	updatedAt: string;
	rights: MediaFolderRightsDto;
}

export interface MediaAssetDto {
	id: string;
	folderId: string;
	name: string;
	mimetype: string;
	size: number;
	width?: number;
	height?: number;
	alt?: string;
	visibility: "inherit" | "private" | "public";
	effectiveVisibility: "private" | "public";
	url: string;
	hasOriginal: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface MediaTreeResponse {
	folders: MediaFolderDto[];
	root: { write: boolean; manage: boolean };
}

export interface MediaAssetsResponse {
	assets: MediaAssetDto[];
	truncated: boolean;
}

export interface MediaPresignResponse {
	uploadUrl: string;
	resourceKey: string;
	expiresAt: number;
	headers: Record<string, string>;
}

export const useMediaApi = () => {
	const { $authFetch } = useAuthFetch();

	return {
		fetchTree: () => $authFetch<MediaTreeResponse>("/api/media/tree"),
		fetchAllAssets: () =>
			$authFetch<MediaAssetsResponse>("/api/media/assets"),
		fetchAsset: (assetId: string) =>
			$authFetch<{ asset: MediaAssetDto }>(`/api/media/assets/${assetId}`),
		fetchPreviews: (ids: string[]) =>
			$authFetch<{ previews: Record<string, string> }>(
				"/api/media/previews",
				{ method: "POST", body: { ids } },
			),
		fetchReadUrl: (assetId: string, preset?: string) =>
			$authFetch<{ url: string }>(
				`/api/media/assets/${assetId}/read-url`,
				{ query: preset ? { preset } : {} },
			),
		createFolder: (name: string, parentId?: string) =>
			$authFetch<{ id: string }>("/api/media/folders", {
				method: "POST",
				body: { name, parentId },
			}),
		renameFolder: (folderId: string, name: string) =>
			$authFetch(`/api/media/folders/${folderId}/rename`, {
				method: "POST",
				body: { name },
			}),
		moveFolder: (folderId: string, parentId: string | null) =>
			$authFetch(`/api/media/folders/${folderId}/move`, {
				method: "POST",
				body: { parentId },
			}),
		deleteFolder: (folderId: string) =>
			$authFetch(`/api/media/folders/${folderId}`, { method: "DELETE" }),
		updateAsset: (assetId: string, changes: { name?: string; alt?: string }) =>
			$authFetch(`/api/media/assets/${assetId}/update`, {
				method: "POST",
				body: changes,
			}),
		moveAsset: (assetId: string, folderId: string) =>
			$authFetch(`/api/media/assets/${assetId}/move`, {
				method: "POST",
				body: { folderId },
			}),
		deleteAsset: (assetId: string) =>
			$authFetch(`/api/media/assets/${assetId}`, { method: "DELETE" }),
		transformAsset: (
			assetId: string,
			ops: {
				crop?: { x: number; y: number; width: number; height: number };
				rotate?: number;
			},
		) =>
			$authFetch<{ asset: MediaAssetDto }>(
				`/api/media/assets/${assetId}/transform`,
				{ method: "POST", body: ops },
			),
		revertAsset: (assetId: string) =>
			$authFetch<{ asset: MediaAssetDto }>(
				`/api/media/assets/${assetId}/revert`,
				{ method: "POST" },
			),
		presignUpload: (folderId: string, file: File) =>
			$authFetch<MediaPresignResponse>("/api/media/upload/presign", {
				method: "POST",
				body: {
					folderId,
					filename: file.name,
					size: file.size,
					mimetype: file.type || "application/octet-stream",
				},
			}),
		confirmUpload: (folderId: string, resourceKey: string, filename: string) =>
			$authFetch<{ asset: MediaAssetDto }>("/api/media/upload/confirm", {
				method: "POST",
				body: { folderId, resourceKey, filename },
			}),
	};
};
