export interface PixelSize {
	width: number
	height: number
}

export interface AspectOption {
	id: string
	label: string
	ratio?: number
	hint?: 'original' | 'thumbnail' | 'portrait' | 'story' | 'social'
}

const HALF_TURN = 180
const MAX_RATIO_LABEL_LENGTH = 7
const RATIO_DECIMALS = 2
const SAME_RATIO_TOLERANCE = 0.01

export const FREE_ASPECT_ID = 'free'
export const ORIGINAL_ASPECT_ID = 'original'

const FIXED_ASPECTS: AspectOption[] = [
	{ id: 'square', label: '1:1', ratio: 1, hint: 'thumbnail' },
	{ id: 'portrait', label: '4:5', ratio: 4 / 5, hint: 'portrait' },
	{ id: '4:3', label: '4:3', ratio: 4 / 3 },
	{ id: '16:9', label: '16:9', ratio: 16 / 9 },
	{ id: 'story', label: '9:16', ratio: 9 / 16, hint: 'story' },
	{ id: 'social', label: '1.91:1', ratio: 1.91, hint: 'social' },
]

function greatestCommonDivisor(left: number, right: number): number {
	return right === 0 ? left : greatestCommonDivisor(right, left % right)
}

/** `16:9`, or the decimal ratio when the reduced fraction is unreadable. */
export function ratioLabel(size: PixelSize): string {
	const divisor = greatestCommonDivisor(size.width, size.height)
	const label = `${size.width / divisor}:${size.height / divisor}`
	return label.length > MAX_RATIO_LABEL_LENGTH ? (size.width / size.height).toFixed(RATIO_DECIMALS) : label
}

/** The image's size once turned by `rotation` degrees (quarter turns swap the axes). */
export function rotatedSize(size: PixelSize, rotation: number): PixelSize {
	return rotation % HALF_TURN === 0 ? size : { width: size.height, height: size.width }
}

function isSameRatio(left: number, right: number): boolean {
	return Math.abs(left - right) / right < SAME_RATIO_TOLERANCE
}

/**
 * Free, the image's own ratio, then the fixed formats that differ from it:
 * a 4:3 photo offers `4:3 original` once, not twice.
 */
export function aspectOptions(size: PixelSize | undefined): AspectOption[] {
	const free: AspectOption = { id: FREE_ASPECT_ID, label: '' }
	if (!size?.width || !size.height) return [free, ...FIXED_ASPECTS]
	const ratio = size.width / size.height
	const original: AspectOption = { id: ORIGINAL_ASPECT_ID, label: ratioLabel(size), ratio, hint: 'original' }
	const fixed = FIXED_ASPECTS.filter((option) => !isSameRatio(option.ratio ?? 0, ratio))
	return [free, original, ...fixed]
}
