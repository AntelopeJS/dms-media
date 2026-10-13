import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyStorageNetworkFailure, diagnoseStorageFailure } from '../app/utils/storageFailure'

const UPLOAD_URL = 'http://api.example.test:5014/file-storage/upload/abc?token=xyz'
const SITE_ORIGIN = 'http://dms.example.test:3014'

describe('storage PUT network failures', () => {
	it('keeps a retryable connection failure when the browser is offline', () => {
		expect(classifyStorageNetworkFailure({ isOnline: false, hasSentBytes: false, isStorageReachable: false })).toBe(
			'connection',
		)
	})

	it('keeps a retryable connection failure when the link dropped mid-send', () => {
		expect(classifyStorageNetworkFailure({ isOnline: true, hasSentBytes: true, isStorageReachable: true })).toBe(
			'connection',
		)
	})

	it('reads a failure before any byte left, with the storage answering, as a CORS refusal', () => {
		expect(classifyStorageNetworkFailure({ isOnline: true, hasSentBytes: false, isStorageReachable: true })).toBe(
			'storage_blocked',
		)
	})

	it('reads a storage nobody reaches from the browser as an unreachable address', () => {
		expect(classifyStorageNetworkFailure({ isOnline: true, hasSentBytes: false, isStorageReachable: false })).toBe(
			'storage_unreachable',
		)
	})
})

describe('diagnosing a storage PUT', () => {
	afterEach(() => vi.unstubAllGlobals())

	function stubBrowser(isOnline: boolean, probe: () => Promise<unknown>) {
		const fetch = vi.fn(probe)
		vi.stubGlobal('navigator', { onLine: isOnline })
		vi.stubGlobal('location', { origin: SITE_ORIGIN, href: `${SITE_ORIGIN}/modules/media/files` })
		vi.stubGlobal('fetch', fetch)
		return fetch
	}

	it('names this site when the storage answers but refused the PUT', async () => {
		const fetch = stubBrowser(true, () => Promise.resolve({ type: 'opaque' }))
		await expect(diagnoseStorageFailure(UPLOAD_URL, false)).resolves.toEqual({
			failure: 'storage_blocked',
			address: SITE_ORIGIN,
		})
		expect(fetch).toHaveBeenCalledWith('http://api.example.test:5014', expect.objectContaining({ mode: 'no-cors' }))
	})

	it('names the storage when it does not answer at all', async () => {
		stubBrowser(true, () => Promise.reject(new TypeError('Failed to fetch')))
		await expect(diagnoseStorageFailure(UPLOAD_URL, false)).resolves.toEqual({
			failure: 'storage_unreachable',
			address: 'http://api.example.test:5014',
		})
	})

	it('does not probe the storage when offline or mid-send', async () => {
		const fetch = stubBrowser(false, () => Promise.resolve({}))
		expect((await diagnoseStorageFailure(UPLOAD_URL, false)).failure).toBe('connection')
		vi.stubGlobal('navigator', { onLine: true })
		expect((await diagnoseStorageFailure(UPLOAD_URL, true)).failure).toBe('connection')
		expect(fetch).not.toHaveBeenCalled()
	})
})
