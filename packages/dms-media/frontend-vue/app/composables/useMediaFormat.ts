const BYTES_PER_UNIT = 1024
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']
const SINGLE_DIGIT_BELOW = 10

/** Locale-aware formats the media screens share: sizes, dimensions, dates. */
export function useMediaFormat() {
	const regional = useRegionalFormat()

	function formatBytes(bytes: number): string {
		let value = Math.max(bytes, 0)
		let unit = 0
		while (value >= BYTES_PER_UNIT && unit < BYTE_UNITS.length - 1) {
			value /= BYTES_PER_UNIT
			unit += 1
		}
		const digits = unit > 0 && value < SINGLE_DIGIT_BELOW ? 1 : 0
		const number = regional.formatNumber(value, { maximumFractionDigits: digits })
		return `${number} ${BYTE_UNITS[unit]}`
	}

	function formatDimensions(width?: number, height?: number): string {
		if (!width || !height) return ''
		return `${regional.formatNumber(width)} × ${regional.formatNumber(height)}`
	}

	return { ...regional, formatBytes, formatDimensions }
}
