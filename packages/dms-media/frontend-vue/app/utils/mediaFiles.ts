import type {
	AssetTypeGroup,
	AssetVisibility,
	ListingParams,
	MediaAsset,
	MediaFolder,
	PathSegment,
} from '../types/media'

const MEDIA_MODULE_URL = '/modules/media'

export const MEDIA_ROUTES = {
	overview: `${MEDIA_MODULE_URL}/overview`,
	files: `${MEDIA_MODULE_URL}/files`,
	file: `${MEDIA_MODULE_URL}/file`,
	editor: `${MEDIA_MODULE_URL}/editor`,
	uploads: `${MEDIA_MODULE_URL}/uploads`,
	presets: `${MEDIA_MODULE_URL}/presets`,
} as const

/** Icons of the visibility vocabulary: public is a globe, private a lock, "same as folder" an elbow arrow. */
export const VISIBILITY_ICONS: Record<AssetVisibility, string> = {
	public: 'i-ph-globe',
	private: 'i-ph-lock-simple',
	inherit: 'i-ph-arrow-elbow-left-up',
}

/** File and folder names compared as people read them: `photo 2` before `photo 10`, case ignored. */
export const NAME_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Realtime topic the backend publishes on after each write to the library. */
export const MEDIA_LIBRARY_TOPIC = 'media.library'

export const TYPE_GROUP_ICONS: Record<AssetTypeGroup, string> = {
	image: 'i-ph-image',
	video: 'i-ph-film-strip',
	audio: 'i-ph-waveform',
	pdf: 'i-ph-file-pdf',
	document: 'i-ph-file-text',
	spreadsheet: 'i-ph-table',
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

/** The formats the image editor saves, as the server's `EDITABLE_IMAGE_MIMETYPES`. */
const EDITABLE_MIMETYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif',
])

/** Icons naming the format itself, where the type group's icon would name another one. */
const EXTENSION_ICONS: Record<string, string> = {
	csv: 'i-ph-file-csv',
	xls: 'i-ph-file-xls',
	xlsx: 'i-ph-file-xls',
	doc: 'i-ph-file-doc',
	docx: 'i-ph-file-doc',
	ppt: 'i-ph-file-ppt',
	pptx: 'i-ph-file-ppt',
	txt: 'i-ph-file-txt',
}

/** Formats the browser shows in a frame from their read URL. */
const FRAMED_MIMETYPES = new Set(['application/pdf'])

/** Formats shown as their first lines of text. */
const TEXT_MIMETYPES = new Set(['text/plain', 'text/csv', 'text/markdown'])

/** The order and filter of the list a file was opened from, which its page browses in. */
export type FileListingOrder = Pick<ListingParams, 'sort' | 'direction' | 'type'>

const FILE_LISTING_KEYS = ['sort', 'direction', 'type'] as const

/** The file page of a file; given the explorer's order, previous and next follow it. */
export function fileLink(assetId: string, order: FileListingOrder = {}): string {
	const query = new URLSearchParams({ asset: assetId })
	for (const key of FILE_LISTING_KEYS) {
		const value = order[key]
		if (value) query.set(key, value)
	}
	return `${MEDIA_ROUTES.file}?${query.toString()}`
}

export function editorLink(assetId: string): string {
	return `${MEDIA_ROUTES.editor}?asset=${encodeURIComponent(assetId)}`
}

export function folderLink(folderId: string): string {
	return `${MEDIA_ROUTES.files}?folder=${encodeURIComponent(folderId)}`
}

export function isImageAsset(asset: Pick<MediaAsset, 'typeGroup'>): boolean {
	return asset.typeGroup === 'image' || asset.typeGroup === 'vector'
}

export function isEditableAsset(asset: Pick<MediaAsset, 'mimetype'>): boolean {
	return EDITABLE_MIMETYPES.has(asset.mimetype)
}

export function assetIconOf(asset: Pick<MediaAsset, 'name' | 'mimetype' | 'typeGroup'>): string {
	return EXTENSION_ICONS[extensionOf(asset)] ?? TYPE_GROUP_ICONS[asset.typeGroup]
}

export function isFramedAsset(asset: Pick<MediaAsset, 'mimetype'>): boolean {
	return FRAMED_MIMETYPES.has(asset.mimetype)
}

export function isTextAsset(asset: Pick<MediaAsset, 'mimetype'>): boolean {
	return TEXT_MIMETYPES.has(asset.mimetype)
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
