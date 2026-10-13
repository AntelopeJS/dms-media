const ANY_TYPE_PATTERNS = new Set(['*', '*/*'])
const WILDCARD = '*'
const FAMILY_WILDCARD = '/*'
const UNKNOWN_MIMETYPE = 'application/octet-stream'
const REFUSED_MIMETYPES = new Set(['text/html', 'application/xhtml+xml'])
const REFUSED_EXTENSIONS = new Set(['htm', 'html', 'xhtml', 'xht', 'shtml', 'mht', 'mhtml'])
/** Extensions a file picker understands for prefix patterns it cannot take as such. */
const PREFIX_EXTENSIONS: Record<string, string[]> = {
	'application/vnd.openxmlformats-officedocument.': ['.docx', '.xlsx', '.pptx'],
	'application/vnd.oasis.opendocument.': ['.odt', '.ods', '.odp'],
}

/** The mimetype the upload routes receive for this file, normalized. */
export function uploadMimetype(file: File): string {
	return ((file.type || UNKNOWN_MIMETYPE).split(';')[0] ?? '').trim().toLowerCase()
}

function matchesPattern(mimetype: string, pattern: string): boolean {
	const normalized = pattern.trim().toLowerCase()
	if (ANY_TYPE_PATTERNS.has(normalized)) return true
	if (!normalized.endsWith(WILDCARD)) return mimetype === normalized
	return mimetype.startsWith(normalized.slice(0, -WILDCARD.length))
}

/** Same rule as the server: exact types, or a trailing `*` matching a prefix. */
export function matchesUploadType(mimetype: string, patterns: readonly string[]): boolean {
	return patterns.some((pattern) => matchesPattern(mimetype, pattern))
}

/** HTML and XHTML never enter the library, whatever the configuration says. */
export function isActiveDocument(file: File): boolean {
	const extension = file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : ''
	return REFUSED_EXTENSIONS.has(extension) || REFUSED_MIMETYPES.has(uploadMimetype(file))
}

function acceptTokens(pattern: string): string[] {
	const normalized = pattern.trim().toLowerCase()
	if (!normalized.endsWith(WILDCARD) || normalized.endsWith(FAMILY_WILDCARD)) return [normalized]
	return PREFIX_EXTENSIONS[normalized.slice(0, -WILDCARD.length)] ?? []
}

/** `accept` attribute of a file input for these patterns; empty when any file goes. */
export function fileAcceptAttribute(patterns: readonly string[] | null | undefined): string {
	if (!patterns?.length || patterns.some((pattern) => ANY_TYPE_PATTERNS.has(pattern.trim()))) return ''
	return [...new Set(patterns.flatMap(acceptTokens))].join(',')
}
