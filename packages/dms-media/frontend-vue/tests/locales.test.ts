import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

type Messages = { [key: string]: string | Messages }

const LOCALES_DIR = join(__dirname, '../i18n/locales')
const APP_DIR = join(__dirname, '../app')
const KEY_PATTERN = /\bt\(\s*'(dms_media\.[a-z0-9_.-]+)'/g

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

	it('translates every literal key the layer uses', () => {
		const known = new Set(leaves(english))
		const used = sources(APP_DIR).flatMap((file) =>
			[...readFileSync(file, 'utf8').matchAll(KEY_PATTERN)].map((match) => match[1]!),
		)
		expect(used.filter((key) => !known.has(key))).toEqual([])
	})
})
