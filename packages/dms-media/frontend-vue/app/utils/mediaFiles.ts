import type {
	AssetTypeGroup,
	MediaAsset,
	MediaFolder,
	PathSegment,
} from '../types/media'

export const MEDIA_ROUTES = {
	overview: '/media/overview',
	files: '/media/files',
	file: '/media/file',
	editor: '/media/editor',
	uploads: '/media/uploads',
	access: '/media/access',
	linked: '/media/linked',
	presets: '/media/presets',
} as const

export const TYPE_GROUP_ICONS: Record<AssetTypeGroup, string> = {
	image: 'i-ph-image',
	video: 'i-ph-film-strip',
	audio: 'i-ph-waveform',
	pdf: 'i-ph-file-pdf',
	document: 'i-ph-file-text',
	spreadsheet: 'i-ph-file-xls',
	vector: 'i-ph-bezier-curve',
	archive: 'i-ph-file-zip',
	other: 'i-ph-file',
}

export const TYPE_GROUP_ORDER: AssetTypeGroup[] = [
	'image',
	'video',
	'pdf',
	'document',
	'spreadsheet',
	'vector',
	'audio',
	'archive',
	'other',
]

const EDITABLE_MIMETYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif',
	'image/tiff',
	'image/gif',
])

export function fileLink(assetId: string): string {
	return `${MEDIA_ROUTES.file}?asset=${encodeURIComponent(assetId)}`
}

export function editorLink(assetId: string): string {
	return `${MEDIA_ROUTES.editor}?asset=${encodeURIComponent(assetId)}`
}

export function folderLink(folderId: string): string {
	return `${MEDIA_ROUTES.files}?folder=${encodeURIComponent(folderId)}`
}

export function accessLink(folderId: string): string {
	return `${MEDIA_ROUTES.access}?folder=${encodeURIComponent(folderId)}`
}

export function isImageAsset(asset: Pick<MediaAsset, 'typeGroup'>): boolean {
	return asset.typeGroup === 'image' || asset.typeGroup === 'vector'
}

export function isEditableAsset(asset: Pick<MediaAsset, 'mimetype'>): boolean {
	return EDITABLE_MIMETYPES.has(asset.mimetype)
}

export function needsAltText(
	asset: Pick<MediaAsset, 'typeGroup' | 'alt'>,
): boolean {
	return isImageAsset(asset) && !asset.alt?.trim()
}

/** `report.final.pdf` → `pdf`; a name without one falls back on the mimetype. */
export function extensionOf(asset: Pick<MediaAsset, 'name' | 'mimetype'>): string {
	const dot = asset.name.lastIndexOf('.')
	if (dot > 0 && dot < asset.name.length - 1)
		return asset.name.slice(dot + 1).toLowerCase()
	return asset.mimetype.split('/').at(-1)?.split('+')[0] ?? ''
}

/** Name without its extension, for renaming while keeping the type. */
export function baseNameOf(asset: Pick<MediaAsset, 'name' | 'mimetype'>): string {
	const extension = extensionOf(asset)
	const suffix = `.${extension}`
	return asset.name.toLowerCase().endsWith(suffix)
		? asset.name.slice(0, -suffix.length)
		: asset.name
}

export function folderAncestors(
	folder: MediaFolder | undefined,
	foldersById: Map<string, MediaFolder>,
): MediaFolder[] {
	const chain: MediaFolder[] = []
	let current = folder
	const seen = new Set<string>()
	while (current && !seen.has(current.id)) {
		seen.add(current.id)
		chain.unshift(current)
		current = current.parentId ? foldersById.get(current.parentId) : undefined
	}
	return chain
}

export function folderPathLabel(
	folder: MediaFolder | undefined,
	foldersById: Map<string, MediaFolder>,
): string {
	return folderAncestors(folder, foldersById)
		.map((entry) => entry.name)
		.join(' › ')
}

export function pathLabel(path: PathSegment[]): string {
	return path.map((segment) => segment.name).join(' › ')
}

export function newBatchId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
