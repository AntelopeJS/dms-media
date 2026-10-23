import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

type Messages = { [key: string]: string | Messages }

const LOCALES_DIR = join(__dirname, '../i18n/locales')
const APP_DIR = join(__dirname, '../app')
const KEY_PATTERN = /\bt\(\s*'(dms_media\.[a-z0-9_.-]+)'/g
// What one line of an overview KPI card holds at four columns (183px of 12px
// text at 1440px wide): a detail on two lines makes the cards taller than their
// skeleton, and every block below moves when they land.
const KPI_DETAIL_MAX_LENGTH = 32
const KPI_DETAILS = ['files_detail', 'storage_detail', 'storage_quota_detail', 'public_share', 'missing_alt_none', 'missing_alt_public']
// The widest values a detail is written with.
const WIDEST_PARAMS: Record<string, string> = { files: '99,999', percent: '100', quota: '100 GB' }

function load(file: string): Messages {
	return JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8')) as Messages
}

function leaves(messages: Messages, prefix = ''): string[] {
	return Object.entries(messages).flatMap(([key, value]) =>
		typeof value === 'string' ? [`${prefix}${key}`] : leaves(value, `${prefix}${key}.`),
	)
}

function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry)
		if (statSync(path).isDirectory()) return sources(path)
		return /\.(vue|ts)$/.test(entry) ? [path] : []
	})
}

describe('media locales', () => {
	const english = load('media-en-GB.json')
	const french = load('media-fr-FR.json')

	it('declares the same keys in English and French', () => {
		expect(leaves(french).sort()).toEqual(leaves(english).sort())
	})

	it('keeps each overview KPI detail on one line of its card', () => {
		for (const messages of [english, french]) {
			const kpis = ((messages.dms_media as Messages).overview as Messages).kpis as Messages
			const written = KPI_DETAILS.flatMap((key) =>
				(kpis[key] as string).split(' | ').map((form) => form.replace(/\{(\w+)\}/g, (_, name: string) => WIDEST_PARAMS[name] ?? name)),
			)
			expect(written.filter((text) => text.length > KPI_DETAIL_MAX_LENGTH)).toEqual([])
		}
	})

	it('translates every literal key the layer uses', () => {
		const known = new Set(leaves(english))
		const used = sources(APP_DIR).flatMap((file) =>
			[...readFileSync(file, 'utf8').matchAll(KEY_PATTERN)].map((match) => match[1]!),
		)
		expect(used.filter((key) => !known.has(key))).toEqual([])
	})
})
