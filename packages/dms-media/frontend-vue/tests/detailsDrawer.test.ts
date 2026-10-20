import { effectScope, isRef, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import './fixtures/serverRender'
import type { ExplorerContext } from '../app/composables/library/useExplorerCommands'
import { useExplorerDetailsDrawer } from '../app/composables/library/useExplorerDetailsDrawer'
import type { ExplorerLayout } from '../app/composables/library/useExplorerLayout'

// Narrower than the inline details panel, the explorer shows its details in
// the DMS drawer: it opens and closes with the layout's state, closing it
// turns the state off, and it follows the explorer's width and lifetime.

interface OpenedDrawer {
	options: { direction: string; componentOptions: { context: ExplorerContext } }
	close: ReturnType<typeof vi.fn>
	settle: () => Promise<void>
}

let opened: OpenedDrawer[] = []

function openDrawer(options: OpenedDrawer['options']) {
	let resolve!: () => void
	const result = new Promise<void>((done) => (resolve = done))
	const drawer: OpenedDrawer = {
		options,
		close: vi.fn(() => resolve()),
		settle: async () => {
			resolve()
			await result
			await nextTick()
		},
	}
	opened.push(drawer)
	return { result, close: drawer.close, patch: vi.fn() }
}

function setup(isWide = false) {
	const layout = { isDetailsDrawerOpen: ref(false), hasInlineDetails: ref(isWide) } as unknown as ExplorerLayout
	const context = { library: { selection: { focusedAsset: ref(null) } }, commands: {} } as unknown as ExplorerContext
	const scope = effectScope()
	scope.run(() => useExplorerDetailsDrawer(layout, context))
	return { layout, scope }
}

async function toggle(layout: ExplorerLayout, isOpen: boolean): Promise<void> {
	layout.isDetailsDrawerOpen.value = isOpen
	await nextTick()
}

beforeEach(() => {
	opened = []
	vi.stubGlobal('useDrawer', () => ({ open: openDrawer }))
})

describe('details drawer', () => {
	it('opens on the right with the live library, and closes with the state', async () => {
		const { layout } = setup()
		await toggle(layout, true)
		expect(opened).toHaveLength(1)
		expect(opened[0]!.options.direction).toBe('right')
		// Handed over raw: the inspector still reads the library's refs.
		expect(isRef(opened[0]!.options.componentOptions.context.library.selection.focusedAsset)).toBe(true)
		await toggle(layout, false)
		expect(opened[0]!.close).toHaveBeenCalledOnce()
	})

	it('turns the state off when the drawer is dismissed', async () => {
		const { layout } = setup()
		await toggle(layout, true)
		await opened[0]!.settle()
		expect(layout.isDetailsDrawerOpen.value).toBe(false)
		await toggle(layout, true)
		expect(opened).toHaveLength(2)
	})

	it('puts the drawer away while the details sit inline, and brings it back', async () => {
		const { layout } = setup()
		await toggle(layout, true)
		layout.hasInlineDetails.value = true
		await nextTick()
		expect(opened[0]!.close).toHaveBeenCalledOnce()
		await nextTick()
		expect(layout.isDetailsDrawerOpen.value).toBe(true)
		layout.hasInlineDetails.value = false
		await nextTick()
		expect(opened).toHaveLength(2)
	})

	it('never opens while the details sit inline', async () => {
		const { layout } = setup(true)
		await toggle(layout, true)
		expect(opened).toHaveLength(0)
	})

	it('closes with the explorer', async () => {
		const { layout, scope } = setup()
		await toggle(layout, true)
		scope.stop()
		expect(opened[0]!.close).toHaveBeenCalledOnce()
	})
})
