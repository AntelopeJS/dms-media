import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

type Manifest = { engines?: Record<string, string> }

function rendererRange(dir: string): string | undefined {
	const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Manifest
	return manifest.engines?.['@antelopejs/dms-frontend']
}

// `ajs dms dev` refuses to start when a frontend module's range excludes the
// installed renderer, so the playground's own frontend must follow this layer.
describe('renderer range', () => {
	it('is the same for the playground frontend as for this layer', () => {
		const layer = rendererRange(join(__dirname, '..'))
		expect(layer).toBeDefined()
		expect(rendererRange(join(__dirname, '../../playground/frontend-vue'))).toBe(layer)
	})
})
