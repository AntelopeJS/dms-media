import { createSharedComposable } from '@vueuse/core'
import MediaLightbox from '../components/shared/MediaLightbox.vue'

/**
 * The file the file page shows, named by its `asset` query parameter: one state
 * shared by the page's blocks (header, viewer, properties, delivery links), so a
 * rename in the properties shows in the header at once.
 */
export const useCurrentFile = createSharedComposable(() => {
	const route = useDmsRoute()
	const router = useDmsRouter()
	const overlay = useOverlay()
	const lightbox = overlay.create(MediaLightbox)
	const assetId = computed(() => (typeof route.query.asset === 'string' ? route.query.asset : undefined))
	const file = useFileDetails(assetId)

	function open(id: string | undefined): void {
		if (id) void router.replace({ path: route.path, query: { ...route.query, asset: id } })
	}

	function fullscreen(): void {
		const asset = file.asset.value
		if (!asset) return
		void lightbox.open({
			assets: file.siblings.value.length ? file.siblings.value : [asset],
			startId: asset.id,
			canEdit: () => file.canWrite.value,
		})
	}

	function edit(): void {
		const asset = file.asset.value
		if (asset && file.canWrite.value && isEditableAsset(asset)) void navigateDms(editorLink(asset.id))
	}

	return { ...file, assetId, open, fullscreen, edit }
})
