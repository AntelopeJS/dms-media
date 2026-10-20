import { computed, effectScope, isRef, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import './fixtures/serverRender'
import type { ExplorerContext } from '../app/composables/library/useExplorerCommands'
import { useExplorerDetailsDrawer } from '../app/composables/library/useExplorerDetailsDrawer'
import type { ExplorerLayout } from '../app/composables/library/useExplorerLayout'
import type { DrawerRowHeader } from '#dms-ui/app/composables/containers/types'

// Narrower than the inline details panel, the explorer shows its details in
// the DMS drawer: it opens and closes with the layout's state, closing it
// turns the state off, and it follows the explorer's width and lifetime.

interface OpenedDrawer {
	options: { direction: string; componentOptions: { context: ExplorerContext }; rowHeader: DrawerRowHeader }
	close: ReturnType<typeof vi.fn>
	patch: ReturnType<typeof vi.fn>
	settle: () => Promise<void>
}

interface TestFile {
	id: string
	name: string
}

let opened: OpenedDrawer[] = []

function openDrawer(options: OpenedDrawer['options']) {
	let resolve!: () => void
	const result = new Promise<void>((done) => (resolve = done))
	const drawer: OpenedDrawer = {
		options,
		close: vi.fn(() => resolve()),
		patch: vi.fn(),
		settle: async () => {
			resolve()
			await result
			await nextTick()
		},
	}
	opened.push(drawer)
	return { result, close: drawer.close, patch: drawer.patch }
}

const FILES: TestFile[] = [
	{ id: 'a', name: 'a.png' },
	{ id: 'b', name: 'b.pdf' },
	{ id: 'c', name: 'c.jpg' },
]

function setup(isWide = false) {
	const layout = { isDetailsDrawerOpen: ref(false), hasInlineDetails: ref(isWide) } as unknown as ExplorerLayout
	const assets = ref(FILES)
	const selectedIds = ref<string[]>([])
	const select = vi.fn((id: string) => (selectedIds.value = [id]))
	const focusedAsset = computed(() =>
		selectedIds.value.length === 1 ? assets.value.find((file) => file.id === selectedIds.value[0]) : undefined,
	)
	const library = { listing: { assets }, selection: { focusedAsset, select } }
	const context = { library, commands: {} } as unknown as ExplorerContext
	const scope = effectScope()
	scope.run(() => useExplorerDetailsDrawer(layout, context))
	return { layout, scope, selectedIds, select }
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

	it('heads a single file with its name and place among the files shown', async () => {
		const { layout, selectedIds } = setup()
		selectedIds.value = ['b']
		await toggle(layout, true)
		const header = opened[0]!.options.rowHeader
		expect(header.title).toBe('b.pdf')
		expect(header.navigation).toMatchObject({ index: 1, total: 3, hasPrev: true, hasNext: true })
	})

	it('keeps its own title without a single file', async () => {
		const { layout, selectedIds } = setup()
		selectedIds.value = ['a', 'b']
		await toggle(layout, true)
		expect(opened[0]!.options.rowHeader).toEqual({})
	})

	it('steps through the files by selecting them, and follows the selection', async () => {
		const { layout, selectedIds, select } = setup()
		selectedIds.value = ['a']
		await toggle(layout, true)
		expect(opened[0]!.options.rowHeader.navigation?.hasPrev).toBe(false)
		opened[0]!.options.rowHeader.navigation?.next()
		expect(select).toHaveBeenCalledWith('b', { extend: false, toggle: false })
		await nextTick()
		const patched = opened[0]!.patch.mock.lastCall?.[0] as { rowHeader: DrawerRowHeader }
		expect(patched.rowHeader.title).toBe('b.pdf')
		expect(patched.rowHeader.navigation?.index).toBe(1)
	})
})
