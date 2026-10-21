import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { serverRender, suspendedMount, type BackendRead } from './fixtures/serverRender'
import AssetValue from '../app/components/field/AssetValue.vue'
import Explorer from '../app/components/Explorer.vue'
import FileHeader from '../app/components/FileHeader.vue'
import FilePreview from '../app/components/FilePreview.vue'
import FileProperties from '../app/components/FileProperties.vue'
import FirstRun from '../app/components/FirstRun.vue'
import ImageEditor from '../app/components/ImageEditor.vue'
import PresetCards from '../app/components/PresetCards.vue'
import RecentFiles from '../app/components/RecentFiles.vue'
import UploadQueue from '../app/components/UploadQueue.vue'
import UploadStrip from '../app/components/UploadStrip.vue'
import { useFieldFolders } from '../app/composables/useFieldFolders'
import type { MediaAsset, MediaFolder } from '../app/types/media'

// What a server render of each block reads, and that it hands every read to
// the browser: a read the page does not hand over is made again by the
// browser, after a server request for nothing.

const RIGHTS = { read: true, write: true, manage: true }

const folder = (id: string, name: string): MediaFolder => ({
	id,
	name,
	parentId: null,
	shell: false,
	bound: false,
	acceptsSubfolders: true,
	binding: null,
	link: null,
	accepts: null,
	visibility: 'private',
	hasOwnAcl: false,
	createdAt: '2026-10-01T10:00:00.000Z',
	updatedAt: '2026-10-01T10:00:00.000Z',
	rights: RIGHTS,
	fileCount: 3,
	size: 3000,
	starred: false,
})

const file = (id: string, name: string, mimetype = 'image/png'): MediaAsset => ({
	id,
	folderId: 'catalog',
	name,
	mimetype,
	size: 1000,
	width: 1200,
	height: 800,
	alt: `${name} alt`,
	visibility: 'inherit',
	effectiveVisibility: 'private',
	url: `/media/${id}/${name}`,
	hasOriginal: false,
	typeGroup: mimetype.startsWith('image/') ? 'image' : 'document',
	starred: false,
	createdAt: '2026-10-01T10:00:00.000Z',
	updatedAt: '2026-10-01T10:00:00.000Z',
})

const FILES = [file('a1', 'harbour.png'), file('a2', 'lighthouse.png'), file('a3', 'dunes.png')]

const ATTENTION = [
	{
		id: 'missing-alt',
		label: { key: 'dms_media.overview.attention.missing_alt_action', params: { files: { type: 'count', value: 2 } } },
		value: 2,
		type: 'status',
		tone: 'warning',
		to: '/modules/media/files?view=missing-alt',
	},
]

function backend({ url }: BackendRead): unknown {
	const details = url.match(/^\/api\/media\/assets\/([^/]+)\/details$/)
	if (details) {
		const found = FILES.find((entry) => entry.id === details[1])
		if (!found) throw Object.assign(new Error('Not Found'), { statusCode: 404 })
		return { asset: found, folder: folder('catalog', 'Catalog'), path: [], uploadedBy: null }
	}
	const one = url.match(/^\/api\/media\/assets\/([^/]+)$/)
	if (one) return { asset: FILES.find((entry) => entry.id === one[1]) }
	if (/\/read-url$/.test(url)) return { url: `https://storage.test${url}`, expiresAt: 0 }
	switch (url) {
		case '/api/media/tree':
			return {
				folders: [folder('catalog', 'Catalog')],
				root: { write: true, manage: true, fileCount: 3, size: 3000 },
				views: { starred: 0, missingAlt: 0 },
				isOwner: true,
				maxUploadBytes: 1000,
				allowedMimetypes: [],
				quotaBytes: null,
			}
		case '/api/media/stats/recent':
			return { assets: FILES }
		case '/api/media/stats/attention':
			return { items: ATTENTION }
		case '/api/media/presets':
			return {
				presets: [{ id: 'thumb', width: 300, height: 300, fit: 'cover', cacheKey: 'thumb.1', rendered: 1, urlPattern: '', exampleUrl: null }],
				cache: { schedule: '', lastSweepAt: null, lastSweepRemoved: null, publicTtlSeconds: 0, privateTtlSeconds: 0 },
				isDefault: true,
				example: null,
			}
		case '/api/media/folders/catalog/assets':
			return { assets: FILES, total: FILES.length, facets: {} }
		case '/api/media/bindings/demo.cover/folder':
			return { folder: { ...folder('covers', 'Demo covers'), bound: true, acceptsSubfolders: false }, maxUploadBytes: 1000, allowedMimetypes: [] }
		default:
			return {}
	}
}

const render = (component: Parameters<typeof serverRender>[0], props: Record<string, unknown> = {}, url = '/') =>
	serverRender(component, props, { url, respond: backend })

/** The file page's blocks, as the page lays them out. */
const FilePage = defineComponent({
	setup: () => () => h('div', [h(FileHeader), h(FilePreview), h(FileProperties)]),
})

describe('server render: the blocks read with the page and hand it over', () => {
	it('recent files: the files and the folder tree', async () => {
		const page = await render(RecentFiles)
		expect(page.reads).toEqual(['GET /api/media/stats/recent', 'GET /api/media/tree'])
		expect(page.handed).toEqual(expect.arrayContaining(page.reads))
		expect(page.html).toContain('lighthouse.png')
		expect(page.html).not.toContain('animate-pulse')
	})

	it('image sizes: the presets', async () => {
		const page = await render(PresetCards)
		expect(page.reads).toEqual(['GET /api/media/presets'])
		expect(page.handed).toEqual(expect.arrayContaining(page.reads))
		expect(page.html).toContain('thumb')
	})

	it('file page: one read of the file and its neighbours for the three blocks, and the image read URL', async () => {
		const page = await render(FilePage, {}, '/modules/media/file?asset=a2')
		expect(page.reads.sort()).toEqual(
			[
				'GET /api/media/tree',
				'GET /api/media/assets/a2/details',
				'GET /api/media/folders/catalog/assets?sort=name&offset=0&limit=500',
				'GET /api/media/assets/a2/read-url?preset=preview',
			].sort(),
		)
		expect(page.handed).toEqual(
			expect.arrayContaining([
				'GET /api/media/tree',
				'dms-media:file:a2:[null,null,null]',
				'dms-media:content:a2:2026-10-01T10:00:00.000Z',
			]),
		)
		// The header's name and position, the viewer's image, the name field.
		expect(page.html).toContain('lighthouse.png')
		expect(page.html).toContain('dms_media.lightbox.position 2 3')
		expect(page.html).toContain('https://storage.test/api/media/assets/a2/read-url')
		expect(page.html).toContain('value="lighthouse"')
	})

	it('file page: a text file is read by the browser alone', async () => {
		FILES.push(file('t1', 'notes.txt', 'text/plain'))
		try {
			const page = await render(FilePage, {}, '/modules/media/file?asset=t1')
			expect(page.reads).not.toContain(expect.stringContaining('read-url'))
			expect(page.html).toContain('notes.txt')
		} finally {
			FILES.pop()
		}
	})

	it('file page: an unknown file is said so, and the failure handed over', async () => {
		const page = await render(FilePage, {}, '/modules/media/file?asset=gone')
		expect(page.reads).toContain('GET /api/media/assets/gone/details')
		expect(page.payload.errors).toHaveProperty(['dms-media:file:gone:[null,null,null]'])
		expect(page.html).toContain('dms_media.file.not_found')
	})

	it('library: a link to a folder reads its files with the page', async () => {
		const page = await render(Explorer, {}, '/modules/media/files?folder=catalog&sort=name&direction=desc')
		expect(page.reads).toEqual([
			'GET /api/media/tree',
			'GET /api/media/folders/catalog/assets?offset=0&limit=120&sort=name&direction=desc&visibility=any&modified=any&orientation=any',
		])
		expect(page.handed).toEqual(expect.arrayContaining(['GET /api/media/tree']))
		expect(page.handed.some((key) => key.startsWith('dms-media:listing:'))).toBe(true)
		expect(page.html).toContain('aria-current="location">Catalog')
		expect(page.html).toContain('dms_media.status.items 3')
	})

	it('library and image editor: the key hints are the platform labels the browser hydrates with', async () => {
		const library = await render(Explorer, {}, '/modules/media/files')
		const editor = await render(ImageEditor, {}, '/modules/media/editor?asset=a1')
		for (const page of [library, editor]) {
			expect(page.html).not.toContain('data-stub="UKbd" value="meta"')
			expect(page.html).toContain('data-stub="UKbd" value="Ctrl"')
		}
	})

	it('image editor: the details, not the image the browser edits', async () => {
		const page = await render(ImageEditor, {}, '/modules/media/editor?asset=a1')
		expect(page.reads).toEqual(['GET /api/media/assets/a1/details'])
		expect(page.handed).toEqual(expect.arrayContaining(page.reads))
		expect(page.html).toContain('dms_media.editor.heading harbour.png')
	})

	it('asset cell: the files it names', async () => {
		const page = await render(AssetValue, { value: ['a1', 'a3', 'a2'] })
		expect(page.reads).toEqual(['GET /api/media/assets/a1', 'GET /api/media/assets/a3'])
		expect(page.handed).toEqual(['dms-media:asset-names:a1,a3'])
		expect(page.html).toContain('harbour.png')
		expect(page.html).toContain('dunes.png')
		expect(page.html).toContain('dms_media.field_widget.more 1')
	})

	it('bound asset field: its folder', async () => {
		const Field = defineComponent({
			setup() {
				const { boundFolder } = useFieldFolders('demo.cover')
				return () => h('p', boundFolder.value?.name ?? 'no folder')
			},
		})
		const page = await render(Field)
		expect(page.reads).toEqual(['GET /api/media/bindings/demo.cover/folder'])
		expect(page.handed).toEqual(page.reads)
		expect(page.html).toContain('Demo covers')
	})
})

// A page block that waits for its reads in `setup` is part of the page's
// Suspense: a client navigation shows it with its data, never a skeleton that
// the data then pushes around.
const PAGE_BLOCKS: [string, Parameters<typeof serverRender>[0], string[], string][] = [
	['image sizes', PresetCards, ['GET /api/media/presets'], 'thumb'],
	['recent files', RecentFiles, ['GET /api/media/stats/recent', 'GET /api/media/tree'], 'lighthouse.png'],
	['upload strip', UploadStrip, ['GET /api/media/tree'], 'dms_media.upload_strip.choose'],
	['upload queue', UploadQueue, ['GET /api/media/tree'], 'dms_media.queue.empty_description_drop'],
	['first run', FirstRun, ['GET /api/media/tree'], ''],
	['library', Explorer, ['GET /api/media/tree'], 'Catalog'],
]

describe('page blocks: shown with the page, without a skeleton', () => {
	it.each(PAGE_BLOCKS)('%s: a client navigation waits for its reads', async (_, block, reads) => {
		const mounted = await suspendedMount(block, { respond: backend })
		expect(mounted.waited).toBe(true)
		expect(mounted.readsBeforeShown).toEqual(expect.arrayContaining(reads))
	})

	it.each(PAGE_BLOCKS)('%s: the server render shows its data, no skeleton', async (_, block, reads, shown) => {
		const page = await render(block)
		expect(page.reads).toEqual(expect.arrayContaining(reads))
		expect(page.html).toContain(shown)
		expect(page.html).not.toContain('data-stub="USkeleton"')
	})
})
