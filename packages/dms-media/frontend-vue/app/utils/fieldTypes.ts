/** Mimetypes worded by their usual name rather than by the family the type filter shows. */
const NAMED_MIMETYPES: Record<string, string> = {
	'application/msword': 'word',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
		'word',
	'text/plain': 'text',
	'text/csv': 'csv',
}

/**
 * What an asset field accepts in words a contributor recognises
 * (`PDF, Word, text`), or an empty text when it takes any file.
 */
export function fieldTypesLabel(
	accept: readonly string[],
	t: (key: string) => string,
): string {
	const labels = accept.map((pattern) => {
		const name = NAMED_MIMETYPES[pattern]
		return name
			? t(`dms_media.field_widget.types.${name}`)
			: acceptedTypesLabel([pattern], t)
	})
	return [...new Set(labels.filter(Boolean))].join(', ')
}
