import { describe, expect, it } from 'vitest'
import { inBrowserApp, type BackendRead } from './fixtures/serverRender'
import { useLibraryListing } from '../app/composables/library/useLibraryListing'
import type { MediaAsset } from '../app/types/media'

// The explorer's listing is one paged read keyed by the location and the
// filters: "load more" appends a page, a revalidation reads every loaded page
// again with the sizes they had, and the local patches keep the next page's
// offset in step with the server.

const FOLDER_FILES = 650
const FOLDER_URL = '/api/media/folders/catalog/assets'

const file = (index: number): MediaAsset => ({
	id: `f${index}`,
	folderId: 'catalog',
	name: `file-${String(index).padStart(4, '0')}.pdf`,
	mimetype: 'application/pdf',
	size: 1000,
	alt: '',
	visibility: 'inherit',
	effectiveVisibility: 'private',
	url: `/media/f${index}/file.pdf`,
	hasOriginal: false,
	typeGroup: 'document',
	starred: false,
	createdAt: '2026-10-01T10:00:00.000Z',
	updatedAt: '2026-10-01T10:00:00.000Z',
})

function folderBackend(files: MediaAsset[]) {
	return ({ url, query }: BackendRead): unknown => {
		if (url !== FOLDER_URL) return {}
		const offset = Number(query.offset)
		const limit = Number(query.limit)
		const sorted = query.direction === 'desc' ? [...files].reverse() : files
		return { assets: sorted.slice(offset, offset + limit), total: files.length, facets: {} }
	}
}

function openListing(files = Array.from({ length: FOLDER_FILES }, (_, index) => file(index))) {
	const app = inBrowserApp(() => useLibraryListing(), folderBackend(files))
	const folderReads = () => app.reads().filter((read) => read.includes(FOLDER_URL))
	return { listing: app.result, folderReads, files }
}

describe('the explorer listing', () => {
	it('reads nothing at the root', () => {
		const { listing, folderReads } = openListing()
		expect(listing.assets.value).toEqual([])
		expect(folderReads()).toEqual([])
	})

	it('reads a folder page by page', async () => {
		const { listing, folderReads } = openListing()
		await listing.setLocation({ kind: 'folder', folderId: 'catalog' })
		expect(listing.assets.value).toHaveLength(120)
		expect(listing.total.value).toBe(FOLDER_FILES)
		expect(listing.hasMore.value).toBe(true)

		await listing.load(true)
		expect(listing.assets.value).toHaveLength(240)
		expect(listing.assets.value[120]?.id).toBe('f120')
		expect(folderReads()).toEqual([
			`GET ${FOLDER_URL}?offset=0&limit=120&sort=name&direction=asc&visibility=any&modified=any&orientation=any`,
			`GET ${FOLDER_URL}?offset=120&limit=120&sort=name&direction=asc&visibility=any&modified=any&orientation=any`,
		])
	})

	it('reads the next page after the files left once some are removed', async () => {
		const { listing, folderReads, files } = openListing()
		await listing.setLocation({ kind: 'folder', folderId: 'catalog' })
		listing.removeAssets(['f0', 'f1'])
		files.splice(0, 2)
		expect(listing.total.value).toBe(FOLDER_FILES - 2)

		await listing.load(true)
		expect(folderReads().at(-1)).toContain('offset=118&limit=120')
		expect(listing.assets.value.map((asset) => asset.id)).toEqual(files.slice(0, 238).map((asset) => asset.id))
	})

	it('loads every file in the largest pages, and reads them again with the same sizes', async () => {
		const { listing, folderReads } = openListing()
		await listing.setLocation({ kind: 'folder', folderId: 'catalog' })
		await listing.loadAll()
		expect(listing.assets.value).toHaveLength(FOLDER_FILES)
		expect(listing.hasMore.value).toBe(false)
		const loaded = folderReads().map((read) => read.match(/offset=\d+&limit=\d+/)?.[0])
		expect(loaded).toEqual(['offset=0&limit=120', 'offset=120&limit=500', 'offset=620&limit=500'])

		await listing.refresh()
		expect(folderReads().slice(loaded.length).map((read) => read.match(/offset=\d+&limit=\d+/)?.[0])).toEqual(loaded)
		expect(listing.assets.value).toHaveLength(FOLDER_FILES)
	})

	it('starts again from the first page when the filters change, and shows the pages of a previous key at once', async () => {
		const { listing, folderReads } = openListing()
		await listing.setLocation({ kind: 'folder', folderId: 'catalog' })
		await listing.load(true)
		await listing.setFilters({ direction: 'desc' })
		expect(listing.assets.value).toHaveLength(120)
		expect(listing.assets.value[0]?.id).toBe(`f${FOLDER_FILES - 1}`)
		expect(folderReads().at(-1)).toContain('offset=0&limit=120&sort=name&direction=desc')

		const back = listing.setFilters({ direction: 'asc' })
		await nextTick()
		expect(listing.assets.value).toHaveLength(240)
		await back
	})

	it('places a new file where the sort puts it and counts one beyond the loaded pages', async () => {
		const { listing } = openListing()
		await listing.setLocation({ kind: 'folder', folderId: 'catalog' })
		listing.insertAsset({ ...file(9000), name: 'file-0000a.pdf' })
		expect(listing.assets.value[1]?.id).toBe('f9000')
		listing.insertAsset({ ...file(9001), name: 'zzz.pdf' })
		expect(listing.assets.value).toHaveLength(121)
		expect(listing.total.value).toBe(FOLDER_FILES + 2)
	})
})
