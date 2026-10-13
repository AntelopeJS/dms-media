import { describe, expect, it } from 'vitest'
import { aspectOptions, ratioLabel, rotatedSize } from '../app/utils/editorAspects'

describe('editor aspect options', () => {
	it('offers the image ratio once, not as a duplicate fixed format', () => {
		const labels = aspectOptions({ width: 4000, height: 3000 }).map((option) => option.label)
		expect(labels.filter((label) => label === '4:3')).toHaveLength(1)
		expect(labels).toEqual(['', '4:3', '1:1', '4:5', '16:9', '9:16', '1.91:1'])
	})

	it('follows a quarter turn', () => {
		const turned = rotatedSize({ width: 1920, height: 1080 }, 90)
		expect(turned).toEqual({ width: 1080, height: 1920 })
		const original = aspectOptions(turned).find((option) => option.id === 'original')
		expect(original?.label).toBe('9:16')
		expect(aspectOptions(turned).some((option) => option.label === '16:9')).toBe(true)
	})

	it('falls back to a decimal label for unusual ratios', () => {
		expect(ratioLabel({ width: 1201, height: 600 })).toBe('2.00')
	})
})
