import type { ComposableText } from '#dms-core/app/utils/composedText'
import type { Tone } from '#dms-ui/app/types/tone'

export type AssetTypeGroup =
	| 'image'
	| 'video'
	| 'audio'
	| 'pdf'
	| 'document'
	| 'spreadsheet'
	| 'vector'
	| 'archive'
	| 'other'

export type FolderVisibility = 'private' | 'public'

export type AssetVisibility = 'inherit' | FolderVisibility

export type MediaRight = 'read' | 'write' | 'manage'

export type MediaRights = Record<MediaRight, boolean>

/** What a linked folder is linked to; `pageTitle` may be a DMS `$key`. */
export interface FolderLink {
	isContentRoot: boolean
	pageTitle: string | null
	pageUrl: string | null
}

export interface MediaFolder {
	id: string
	name: string
	parentId: string | null
	shell: boolean
	bound: boolean
	binding: string | null
	link: FolderLink | null
	/** Whether new folders may go inside: false for a linked folder unless its binding allows subfolders. */
	acceptsSubfolders: boolean
	/** Mimetype patterns the field the folder feeds accepts; null when unlinked or unrestricted. */
	accepts: string[] | null
	visibility: FolderVisibility
	hasOwnAcl: boolean
	createdAt: string
	updatedAt: string
	rights: MediaRights
	fileCount: number
	size: number
	starred: boolean
}

export type SearchMatch = 'name' | 'alt'

export interface MediaAsset {
	id: string
	folderId: string
	name: string
	mimetype: string
	size: number
	width?: number
	height?: number
	alt?: string
	visibility: AssetVisibility
	effectiveVisibility: FolderVisibility
	url: string
	hasOriginal: boolean
	typeGroup: AssetTypeGroup
	starred: boolean
	createdAt: string
	updatedAt: string
	matchedOn?: SearchMatch
}

export interface MediaRootInfo {
	write: boolean
	manage: boolean
	fileCount: number
	size: number
}

export interface MediaViewCounts {
	starred: number
	missingAlt: number
}

/** The folder a field binding created (null when the user cannot see it), with the library's upload limits. */
export interface BoundFolderAnswer {
	folder: MediaFolder | null
	maxUploadBytes: number
	allowedMimetypes: string[]
}

export interface MediaTree {
	folders: MediaFolder[]
	root: MediaRootInfo
	views: MediaViewCounts
	isOwner: boolean
	maxUploadBytes: number
	/** Mimetype patterns the library accepts at all, from the module config. */
	allowedMimetypes: string[]
	quotaBytes: number | null
}

export type TypeFacets = Partial<Record<AssetTypeGroup | 'all', number>>

export interface AssetPage {
	assets: MediaAsset[]
	total: number
	facets: TypeFacets
	folders?: MediaFolder[]
}

export type AssetSortKey = 'name' | 'date' | 'size' | 'type'

export type SortDirection = 'asc' | 'desc'

export type SmartView = 'recent' | 'starred' | 'missing-alt' | 'largest' | 'public'

export type ModifiedWindow = 'any' | '7d' | '30d' | 'year'

export type VisibilityFilter = 'any' | FolderVisibility

export type OrientationFilter = 'any' | 'landscape' | 'portrait' | 'square'

export interface ListingParams {
	offset?: number
	limit?: number
	sort?: AssetSortKey
	direction?: SortDirection
	type?: AssetTypeGroup
	visibility?: VisibilityFilter
	modified?: ModifiedWindow
	orientation?: OrientationFilter
	/** Folder whose subtree bounds a smart view or a search. */
	folderId?: string
}

export interface SearchParams extends ListingParams {
	q: string
}

export interface BulkRefusal {
	id: string
	status: number
	message: string
}

export interface BulkOutcome {
	done: string[]
	refused: BulkRefusal[]
}

export interface FolderImpact {
	subfolders: number
	files: number
	size: number
	publicFiles: number
	linkedSubfolders: number
}

export interface PathSegment {
	id: string
	name: string
}

export interface AssetDetails {
	asset: MediaAsset
	folder: MediaFolder
	path: PathSegment[]
	uploadedBy: string | null
}

export interface PresignResponse {
	uploadUrl: string
	resourceKey: string
	expiresAt: number
	headers: Record<string, string>
}

export interface DeliveryPreset {
	id: string
	width?: number
	height?: number
	fit?: string
	format?: string
	quality?: number
	cacheKey: string
	rendered: number
	urlPattern: string
}

export interface PresetCacheInfo {
	schedule: string
	lastSweepAt: string | null
	lastSweepRemoved: number | null
	publicTtlSeconds: number
	privateTtlSeconds: number
}

export interface PresetsResponse {
	presets: DeliveryPreset[]
	cache: PresetCacheInfo
}

export type DeleteFilesChoice = 'delete' | 'private' | null

/** A row of the overview's attention list (`/stats/attention`): what to act on, how many files, where. */
export interface AttentionItem {
	id: string
	/** A `$` key or a composed text, written in the reader's language. */
	label: ComposableText
	value: number
	type: 'status'
	tone: Tone
	detail?: ComposableText
	to: string
}

export interface AttentionResponse {
	items: AttentionItem[]
}
