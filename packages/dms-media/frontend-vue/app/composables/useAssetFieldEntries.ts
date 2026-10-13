import { defaultDocument, defaultWindow, useEventListener } from '@vueuse/core'
import type { Ref } from 'vue'
import type { MediaAsset } from '../types/media'

/**
 * One value of an asset field: the file it names once loaded, `loading`
 * until then, or `missing` when the server answers that it does not know it
 * (deleted, or in a folder the user cannot open: it answers both the same
 * way, so as not to reveal what the user cannot see).
 */
export interface AssetFieldEntry {
	id: string
	asset: MediaAsset | null
	loading: boolean
	missing: boolean
}

/**
 * The files an asset field holds, loaded by id in the browser. An id the
 * server no longer knows stays in the list as a missing entry, so a deleted file is reported in the
 * field instead of silently vanishing; the list is checked again whenever the
 * page comes back to the foreground.
 */
export function useAssetFieldEntries(ids: Ref<string[]>) {
	const api = useMediaApi()
	const assets = reactive(new Map<string, MediaAsset>())
	const missing = reactive(new Set<string>())

	/** Only a confirmed 404 makes a file missing; any other failure leaves it loading, retried on the next refresh. */
	async function loadOne(id: string): Promise<void> {
		try {
			const { asset } = await api.asset(id)
			assets.set(id, asset)
			missing.delete(id)
		} catch (error) {
			if (!isNotFoundError(error)) return
			assets.delete(id)
			missing.add(id)
		}
	}

	async function load(list: string[], force = false): Promise<void> {
		if (!defaultWindow) return
		const pending = force
			? list
			: list.filter((id) => !assets.has(id) && !missing.has(id))
		await Promise.all(pending.map(loadOne))
	}

	function remember(asset: MediaAsset): void {
		assets.set(asset.id, asset)
		missing.delete(asset.id)
	}

	function refresh(): void {
		if (document.visibilityState === 'visible') void load(ids.value, true)
	}

	const isLoaded = (id: string) => assets.has(id) || missing.has(id)

	watch(ids, (list) => void load(list), { immediate: true })
	useEventListener(defaultDocument, 'visibilitychange', refresh)
	useEventListener(defaultWindow, 'focus', refresh)

	const entries = computed<AssetFieldEntry[]>(() =>
		ids.value.map((id) => ({
			id,
			asset: assets.get(id) ?? null,
			loading: !isLoaded(id),
			missing: missing.has(id),
		})),
	)
	const isLoading = computed(() => ids.value.some((id) => !isLoaded(id)))

	return { entries, isLoading, remember }
}
