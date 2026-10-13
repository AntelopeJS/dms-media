const ANY_TYPE_PATTERNS = new Set(['*', '*/*'])

/** The type family a mimetype pattern names, as the type filter labels it. */
const PATTERN_FAMILIES: [RegExp, string][] = [
	[/^image\/svg/, 'vector'],
	[/^image\//, 'image'],
	[/^video\//, 'video'],
	[/^audio\//, 'audio'],
	[/pdf$/, 'pdf'],
	[/csv|excel|spreadsheet/, 'spreadsheet'],
	[/zip|compressed|tar|rar|7z/, 'archive'],
	[/msword|wordprocessing|presentation|powerpoint|opendocument|rtf|^text\//, 'document'],
]
const SUBTYPE_SEPARATOR = /[.+-]/

/** Whether a folder that takes `offered` (any file when empty) takes every type in `wanted`. */
export function coversMimePatterns(offered: readonly string[] | null | undefined, wanted: readonly string[]): boolean {
	if (!offered?.length || wanted.length === 0) return true
	return wanted.every((pattern) => matchesUploadType(pattern, offered))
}

function patternLabel(pattern: string, t: (key: string) => string): string {
	const family = PATTERN_FAMILIES.find(([matcher]) => matcher.test(pattern))?.[1]
	if (family) return t(`dms_media.types.${family}`)
	const subtype = pattern.split('/').pop() ?? pattern
	return (subtype.split(SUBTYPE_SEPARATOR).pop() ?? subtype).toUpperCase()
}

/** What a field accepts in words (`Images, PDF`), or an empty text when it takes any file. */
export function acceptedTypesLabel(accept: string[], t: (key: string) => string): string {
	if (accept.length === 0 || accept.some((pattern) => ANY_TYPE_PATTERNS.has(pattern))) return ''
	return [...new Set(accept.map((pattern) => patternLabel(pattern, t)))].join(', ')
}
