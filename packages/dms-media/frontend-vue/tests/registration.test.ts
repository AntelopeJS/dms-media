import { expect, it, vi } from 'vitest'
import frontendModule from '../dms.frontend'

it('registers every block under the DmsMedia prefix by its file name', async () => {
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
	} as never)
	const names = registerComponent.mock.calls.map(([name]) => name)
	expect(frontendModule.componentPrefix).toBe('DmsMedia')
	expect(names).toEqual(
		expect.arrayContaining(['Explorer', 'AssetPicker', 'FileHeader', 'FilePreview', 'FileProperties', 'FileDelivery', 'ImageEditor', 'AccessEditor', 'UploadQueue', 'LinkedDetail']),
	)
	expect(names).not.toContain('ExplorerShell')
	expect(new Set(names).size).toBe(names.length)
})
