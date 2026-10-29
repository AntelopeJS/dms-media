import type { ComputedRef, Ref } from 'vue'
import type { AssetDetails } from '../../types/media'
import type { TransformOperations } from '../../composables/useMediaApi'

/** What the editor's save, save-copy and revert actions read from the editor. */
export interface EditorSaving {
	asset: ComputedRef<AssetDetails['asset'] | undefined>
	isSaving: Ref<boolean>
	hasChanges: () => boolean
	operations: () => TransformOperations
	api: ReturnType<typeof useMediaApi>
	toast: ReturnType<typeof useToast>
	t: ReturnType<typeof useI18n>['t']
	confirm: ReturnType<typeof useConfirm>['confirm']
}

/**
 * The editor's save, save-copy and revert actions, with the unsaved-changes
 * guard they lift once a save leaves the page.
 */
export function useEditorSaving({ asset, isSaving, hasChanges, operations, api, toast, t, confirm }: EditorSaving) {
	const isLeavingSaved = ref(false)

	useUnsavedChanges({ dirty: () => hasChanges() && !isLeavingSaved.value })

	async function leaveTo(path: string): Promise<void> {
		isLeavingSaved.value = true
		await navigateDms(path)
	}

	async function saveWith(run: () => Promise<void>): Promise<void> {
		if (!asset.value || !hasChanges() || isSaving.value) return
		isSaving.value = true
		try {
			await run()
		} catch (error) {
			useApiError(error, { title: t('dms_media.editor.save_failed') })
		} finally {
			isSaving.value = false
		}
	}

	function save(): Promise<void> {
		return saveWith(async () => {
			const current = asset.value!
			await api.transform(current.id, operations())
			toast.add({
				title: t('dms_media.editor.saved'),
				description: t('dms_media.editor.saved_description'),
				color: 'success',
				icon: 'i-ph-check-circle',
				actions: [{ label: t('dms_media.editor.revert_to_original'), onClick: () => void revert(true) }],
			})
			await leaveTo(fileLink(current.id))
		})
	}

	function saveCopy(): Promise<void> {
		return saveWith(async () => {
			const { asset: copy } = await api.transformCopy(asset.value!.id, operations())
			toast.add({ title: t('dms_media.editor.copy_saved', { name: copy.name }), color: 'success', icon: 'i-ph-copy' })
			await leaveTo(fileLink(copy.id))
		})
	}

	async function revert(skipConfirm = false): Promise<void> {
		const current = asset.value
		if (!current) return
		const run = async () => {
			await api.revert(current.id)
			toast.add({ title: t('dms_media.editor.reverted'), color: 'success', icon: 'i-ph-arrow-counter-clockwise' })
			await leaveTo(fileLink(current.id))
		}
		if (skipConfirm) return run().catch((error) => useApiError(error, { title: t('dms_media.editor.revert_failed') }))
		await confirm({
			title: t('dms_media.editor.revert_title'),
			description: t('dms_media.editor.revert_description'),
			icon: 'i-ph-arrow-counter-clockwise',
			color: 'warning',
			confirmLabel: t('dms_media.editor.revert_to_original'),
			onConfirm: run,
		})
	}

	return { save, saveCopy, revert }
}
