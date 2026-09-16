import { expect, it, vi } from 'vitest'
import frontendModule from '../dms.frontend'

it('preserves Finder directory and index names without colliding with media components', async () => {
	const registerComponent = vi.fn()
	await frontendModule.setup({
		options: { public: {} },
		registerComponent,
		registerPage: vi.fn(),
		registerDynamicPage: vi.fn(),
		registerLayout: vi.fn(),
		registerErrorPage: vi.fn(),
		registerPlugin: vi.fn(),
		registerMiddleware: vi.fn(),
		provide: vi.fn(),
		use: vi.fn(),
	})
	const names = registerComponent.mock.calls.map(([name]) => name)
	expect(names).toEqual(
		expect.arrayContaining([
			'DmsMediaLibrary',
			'DmsMediaAssetPicker',
			'DmsMediaPickerExplorer',
			'Finder',
			'FinderRoot',
			'FinderLayoutNavigation',
			'FinderLayoutView',
			'FinderLayoutViewGrid',
			'FinderLayoutViewCardGrid',
			'FinderComponentsSearchFile',
		]),
	)
	expect(names).not.toContain('FinderIndex')
	expect(names).not.toContain('DmsMediaGrid')
	expect(new Set(names).size).toBe(names.length)
})
