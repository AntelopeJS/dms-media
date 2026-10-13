import type { MediaAsset } from '../../types/media'
import type { UploadBatchOutcome } from '../useUploadQueue'
import type { MediaLibrary } from './useMediaLibrary'

export interface UploadTarget {
	id: string
	name: string
}

export interface ExplorerUploadOptions {
	accept?: string[]
	/** Ticks a file the picker uploaded, so it is ready to insert. */
	pick: (asset: MediaAsset) => void
}

/**
 * Uploads started from one explorer: a picker keeps the files it accepts and
 * ticks the files it uploaded; each batch has one toast that turns into its
 * outcome.
 */
export function useExplorerUploads(library: MediaLibrary, options: ExplorerUploadOptions) {
	const uploads = useUploadQueue()
	const uploadToasts = useUploadToasts()
	const { update } = useMediaPrefs()
	const { t } = library
	const ownBatches = new Set<string>()
	const isPick = library.mode === 'pick'

	/** Names a single refused file; several are counted. Either way, says what the field takes. */
	function announceRefused(refused: File[]): void {
		const [only] = refused
		if (!only) return
		const title = refused.length === 1
			? t('dms_media.field_widget.upload.type_refused', { names: only.name }, 1)
			: t('dms_media.toasts.upload_not_accepted', { count: refused.length }, refused.length)
		const types = fieldTypesLabel(options.accept ?? [], t)
		library.toast.add({
			title,
			description: types ? t('dms_media.field_widget.upload.accepts', { types }) : undefined,
			color: 'warning',
			icon: 'i-ph-prohibit',
		})
	}

	function enqueue(files: File[], folder: UploadTarget): void {
		const accepted = isPick ? files.filter((file) => acceptsMimetype(file.type, options.accept)) : files
		announceRefused(files.filter((file) => !accepted.includes(file)))
		if (accepted.length === 0) return
		update({ lastFolderId: folder.id })
		const batchId = uploads.enqueue(accepted, { folderId: folder.id, folderName: folder.name })
		ownBatches.add(batchId)
		uploadToasts.announce(batchId, accepted.length, folder.name, { showUploadsLink: !isPick })
	}

	function isShowing(folderId: string): boolean {
		const current = library.listing.location.value
		return current.kind === 'folder' && current.folderId === folderId
	}

	/** A picker that uploaded elsewhere, through the destination dialog, opens that folder and ticks the files. */
	async function pickUploadedElsewhere(outcome: UploadBatchOutcome): Promise<void> {
		const uploaded = uploads.items.value.flatMap((item) => (item.batchId === outcome.batchId && item.asset ? [item.asset] : []))
		if (uploaded.length === 0 || isShowing(outcome.folderId)) return
		await library.openFolder(outcome.folderId)
		uploaded.forEach((asset) => options.pick(asset))
	}

	const stopSettled = uploads.onBatchSettled((outcome) => {
		if (!ownBatches.delete(outcome.batchId)) return
		if (isPick) void pickUploadedElsewhere(outcome)
	})

	function isOwnUpload(asset: MediaAsset): boolean {
		const item = uploads.items.value.find((entry) => entry.asset?.id === asset.id)
		return Boolean(item && ownBatches.has(item.batchId))
	}

	const stopListening = uploads.onUploaded((asset) => {
		library.tree.adjustCounts(asset.folderId, 1, asset.size)
		if (needsAltText(asset)) library.tree.adjustView('missingAlt', 1)
		if (!isShowing(asset.folderId)) return
		library.listing.insertAsset(asset)
		if (isPick && isOwnUpload(asset)) options.pick(asset)
	})
	onBeforeUnmount(() => {
		stopListening()
		stopSettled()
	})

	return { uploads, enqueue }
}
