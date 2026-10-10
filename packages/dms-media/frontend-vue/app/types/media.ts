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

export interface MediaFolder {
	id: string
	name: string
	parentId: string | null
	shell: boolean
	bound: boolean
	binding: string | null
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

export interface MediaTree {
	folders: MediaFolder[]
	root: MediaRootInfo
	views: MediaViewCounts
	canManagePermissions: boolean
	maxUploadBytes: number
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

export type SmartView = 'recent' | 'starred' | 'missing-alt'

export type ModifiedWindow = 'any' | '7d' | '30d' | 'year'

export type VisibilityFilter = 'any' | FolderVisibility

export interface ListingParams {
	offset?: number
	limit?: number
	sort?: AssetSortKey
	direction?: SortDirection
	type?: AssetTypeGroup
}

export interface SearchParams extends ListingParams {
	q: string
	folderId?: string
	visibility?: VisibilityFilter
	modified?: ModifiedWindow
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

export interface ActivityEntry {
	id?: string
	icon?: string
	tone?: string
	title: string
	meta?: string[]
	params?: Record<string, string>
	date?: string
	to?: string
}

export interface AclSubject {
	kind: 'permission' | 'role'
	id: string
}

export interface AclEntry {
	subject: AclSubject
	rights: MediaRight[]
}

export interface LabelledAclEntry extends AclEntry {
	label?: string
	memberCount?: number
}

export interface AccessMember {
	userId: string
	name: string
}

export interface RightHolders {
	count: number
	sample: AccessMember[]
}

export interface ChainLink {
	id: string | null
	name: string
	hasOwnAcl: boolean
}

export interface VisibilityOverride {
	id: string
	name: string
	visibility: AssetVisibility
}

export interface FolderAccessSummary {
	folder: MediaFolder
	chain: ChainLink[]
	sourceId: string | null
	isOwn: boolean
	entries: LabelledAclEntry[]
	rights: Record<MediaRight, RightHolders>
	canEdit: boolean
	directFiles: number
	overrides: VisibilityOverride[]
}

export interface RoleOption {
	id: string
	name: string
}

export interface PermissionOption {
	id: string
	title: string
}

export interface AccessSubjects {
	roles: RoleOption[]
	permissions: PermissionOption[]
}

export interface LinkedFieldInfo {
	multiple?: boolean
	max?: number
	mimetypes?: string[]
}

export interface LinkedFolderDetail {
	id: string
	folderId: string
	folderName: string
	path: string
	createdAt: string
	visibility: FolderVisibility
	field: LinkedFieldInfo
	read: string[]
	write: string[]
	manage: string[]
	fromPage: boolean
	definition: string
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
