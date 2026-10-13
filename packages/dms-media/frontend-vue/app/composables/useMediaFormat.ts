/** Decimal units, as the dashboard writes sizes: 1 kB is 1,000 bytes. */
const BYTES_PER_UNIT = 1000
const BYTE_UNITS = ['b', 'kb', 'mb', 'gb', 'tb']
const SINGLE_DIGIT_BELOW = 10

/** Locale-aware formats the media screens share: sizes, dimensions, dates. */
export function useMediaFormat() {
	const regional = useRegionalFormat()
	const { t } = useI18n()

	/** A byte size in its largest whole unit, with the unit of the reader's language ("3.2 MB", "3,2 Mo"). */
	function formatBytes(bytes: number): string {
		let value = Math.max(bytes, 0)
		let unit = 0
		while (value >= BYTES_PER_UNIT && unit < BYTE_UNITS.length - 1) {
			value /= BYTES_PER_UNIT
			unit += 1
		}
		const digits = unit > 0 && value < SINGLE_DIGIT_BELOW ? 1 : 0
		const number = regional.formatNumber(value, { maximumFractionDigits: digits })
		return t(`dms_media.units.${BYTE_UNITS[unit]}`, { value: number })
	}

	function formatDimensions(width?: number, height?: number): string {
		if (!width || !height) return ''
		return `${regional.formatNumber(width)} × ${regional.formatNumber(height)}`
	}

	return { ...regional, formatBytes, formatDimensions }
}
