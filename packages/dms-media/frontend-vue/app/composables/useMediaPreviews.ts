import type { MediaAsset } from '../types/media'

const PREVIEW_LIFETIME_MS = 11 * 60 * 60 * 1000
const BATCH_DELAY_MS = 30
const MAX_BATCH = 200

interface CachedPreview {
	url: string
	expiresAt: number
}

const cache = reactive(new Map<string, CachedPreview>())
const pending = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | undefined

function isFresh(entry: CachedPreview | undefined): boolean {
	return Boolean(entry && entry.expiresAt > Date.now())
}

/**
 * Thumbnail URLs of the library, fetched in batches and shared by every
 * screen, so moving between folders never refetches what is on screen.
 */
export function useMediaPreviews() {
	const api = useMediaApi()

	async function flush(): Promise<void> {
		flushTimer = undefined
		const ids = [...pending].slice(0, MAX_BATCH)
		ids.forEach((id) => pending.delete(id))
		if (ids.length === 0) return
		try {
			const { previews } = await api.previews(ids)
			const expiresAt = Date.now() + PREVIEW_LIFETIME_MS
			for (const [id, url] of Object.entries(previews))
				cache.set(id, { url, expiresAt })
		} catch {
			return
		}
		if (pending.size > 0) schedule()
	}

	function schedule(): void {
		flushTimer ??= setTimeout(() => void flush(), BATCH_DELAY_MS)
	}

	function request(assets: Array<Pick<MediaAsset, 'id' | 'typeGroup'>>): void {
		for (const asset of assets) {
			if (asset.typeGroup !== 'image' && asset.typeGroup !== 'vector') continue
			if (isFresh(cache.get(asset.id))) continue
			pending.add(asset.id)
		}
		if (pending.size > 0) schedule()
	}

	function previewOf(assetId: string): string | undefined {
		const entry = cache.get(assetId)
		return isFresh(entry) ? entry?.url : undefined
	}

	function forget(assetId: string): void {
		cache.delete(assetId)
	}

	return { request, previewOf, forget }
}
