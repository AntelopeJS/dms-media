import type { AssetDetails, AssetVisibility, MediaAsset, MediaTree } from '../types/media'

const SIBLINGS_LIMIT = 500

/** One file of the library, its neighbours in the folder and the writes on it. */
export function useFileDetails(assetId: Ref<string | undefined>) {
	const api = useMediaApi()
	const { t } = useI18n()
	const toast = useToast()
	const details = ref<AssetDetails | null>(null)
	const siblings = ref<MediaAsset[]>([])
	const tree = ref<MediaTree | null>(null)
	const isLoading = ref(false)
	const error = ref<unknown>(null)

	const asset = computed(() => details.value?.asset)
	const index = computed(() => siblings.value.findIndex((entry) => entry.id === assetId.value))
	const previous = computed(() => (index.value > 0 ? siblings.value[index.value - 1] : undefined))
	const next = computed(() =>
		index.value >= 0 && index.value < siblings.value.length - 1 ? siblings.value[index.value + 1] : undefined,
	)
	const canWrite = computed(() => Boolean(details.value?.folder.rights.write))
	const canChangeVisibility = computed(
		() => Boolean(details.value?.folder.rights.manage) && Boolean(tree.value?.canManagePermissions),
	)

	async function load(id: string): Promise<void> {
		isLoading.value = true
		try {
			const loaded = await api.details(id)
			const folderChanged = loaded.asset.folderId !== details.value?.asset.folderId
			details.value = loaded
			error.value = null
			if (folderChanged) {
				const page = await api.folderAssets(loaded.asset.folderId, { limit: SIBLINGS_LIMIT, sort: 'name' })
				siblings.value = page.assets
			}
		} catch (cause) {
			error.value = cause
		} finally {
			isLoading.value = false
		}
	}

	function patch(changes: Partial<MediaAsset>): void {
		if (!details.value) return
		details.value = { ...details.value, asset: { ...details.value.asset, ...changes } }
		siblings.value = siblings.value.map((entry) => (entry.id === details.value?.asset.id ? { ...entry, ...changes } : entry))
	}

	async function rename(name: string): Promise<boolean> {
		const current = asset.value
		if (!current || !name || name === current.name) return false
		patch({ name })
		try {
			await api.updateAsset(current.id, { name })
			return true
		} catch (cause) {
			patch({ name: current.name })
			useApiError(cause, { title: t('dms_media.toasts.rename_failed') })
			return false
		}
	}

	async function setAlt(alt: string): Promise<boolean> {
		const current = asset.value
		if (!current) return false
		try {
			await api.updateAsset(current.id, { alt })
			patch({ alt })
			return true
		} catch (cause) {
			useApiError(cause, { title: t('dms_media.toasts.alt_failed') })
			return false
		}
	}

	async function setVisibility(visibility: AssetVisibility): Promise<void> {
		const current = asset.value
		if (!current) return
		try {
			const outcome = await api.setAssetsVisibility([current.id], visibility)
			if (outcome.refused.length) throw { data: { message: outcome.refused[0]?.message } }
			await load(current.id)
			toast.add({ title: t('dms_media.file.visibility_saved'), color: 'success', icon: 'i-ph-check-circle' })
		} catch (cause) {
			useApiError(cause, { title: t('dms_media.toasts.visibility_failed') })
		}
	}

	async function move(folderId: string): Promise<void> {
		const current = asset.value
		if (!current) return
		try {
			const outcome = await api.moveAssets([current.id], folderId)
			if (outcome.refused.length) throw { data: { message: outcome.refused[0]?.message } }
			await load(current.id)
			toast.add({ title: t('dms_media.toasts.moved', { count: 1 }, 1), color: 'success' })
		} catch (cause) {
			useApiError(cause, { title: t('dms_media.toasts.move_failed') })
		}
	}

	async function remove(): Promise<boolean> {
		const current = asset.value
		if (!current) return false
		try {
			const outcome = await api.deleteAssets([current.id])
			if (outcome.refused.length) throw { data: { message: outcome.refused[0]?.message } }
			toast.add({ title: t('dms_media.toasts.deleted', { count: 1 }, 1), color: 'success', icon: 'i-ph-trash' })
			return true
		} catch (cause) {
			useApiError(cause, { title: t('dms_media.toasts.delete_failed') })
			return false
		}
	}

	watch(
		assetId,
		(id) => {
			if (id) void load(id)
		},
		{ immediate: true },
	)
	onMounted(async () => {
		tree.value = await api.tree().catch(() => null)
	})

	return {
		details,
		asset,
		siblings,
		tree,
		index,
		previous,
		next,
		isLoading,
		error,
		canWrite,
		canChangeVisibility,
		load,
		rename,
		setAlt,
		setVisibility,
		move,
		remove,
	}
}

export type FileDetailsState = ReturnType<typeof useFileDetails>
