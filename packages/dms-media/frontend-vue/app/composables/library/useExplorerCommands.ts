import type { InjectionKey } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import DeleteFilesDialog from '../../components/dialogs/DeleteFilesDialog.vue'
import DestinationDialog from '../../components/dialogs/DestinationDialog.vue'
import LockedDialog from '../../components/dialogs/LockedDialog.vue'
import MoveDialog from '../../components/dialogs/MoveDialog.vue'
import NameDialog from '../../components/dialogs/NameDialog.vue'
import ShortcutsDialog from '../../components/dialogs/ShortcutsDialog.vue'
import VisibilityDialog from '../../components/dialogs/VisibilityDialog.vue'
import type { MediaAsset, MediaFolder } from '../../types/media'
import type { MediaLibrary } from './useMediaLibrary'

const MENU_SETTLE_MS = 80

function afterMenusClose(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, MENU_SETTLE_MS))
}

export interface ExplorerHandlers {
	/** Opens the OS file dialog; the shell owns the hidden input. */
	pickFiles: (folderId: string, folderName: string) => void
	/** Opens the preview lightbox on a file. */
	preview: (asset: MediaAsset) => void
}

/** Every command of the explorer, its dialogs and the menus that offer them. */
export function useExplorerCommands(library: MediaLibrary, handlers: ExplorerHandlers) {
	const overlay = useOverlay()
	const { confirm } = useConfirm()
	const { t } = library
	const format = useMediaFormat()
	const { prefs, update: updatePrefs } = useMediaPrefs()
	const nameDialog = overlay.create(NameDialog)
	const moveDialog = overlay.create(MoveDialog)
	const deleteDialog = overlay.create(DeleteFilesDialog)
	const visibilityDialog = overlay.create(VisibilityDialog)
	const destinationDialog = overlay.create(DestinationDialog)
	const shortcutsDialog = overlay.create(ShortcutsDialog)
	const lockedDialog = overlay.create(LockedDialog)
	const isBrowse = library.mode === 'browse'
	const canManagePermissions = computed(
		() => library.tree.tree.value?.canManagePermissions ?? false,
	)

	function folderOf(asset: MediaAsset): MediaFolder | undefined {
		return library.tree.foldersById.value.get(asset.folderId)
	}

	function canWriteAsset(asset: MediaAsset): boolean {
		return Boolean(folderOf(asset)?.rights.write)
	}

	function canChangeVisibility(asset: MediaAsset): boolean {
		return Boolean(folderOf(asset)?.rights.manage) && canManagePermissions.value
	}

	async function newFolder(parentId?: string | null): Promise<void> {
		const parent = parentId ?? library.currentFolder.value?.id
		const name = await nameDialog.open({
			title: t('dms_media.dialogs.new_folder.title'),
			description: parent
				? t('dms_media.dialogs.new_folder.inside', {
						name: library.tree.foldersById.value.get(parent)?.name ?? '',
					})
				: t('dms_media.dialogs.new_folder.at_root'),
			icon: 'i-ph-folder-plus',
			label: t('dms_media.dialogs.new_folder.label'),
			confirmLabel: t('dms_media.dialogs.new_folder.confirm'),
		})
		if (name) await library.actions.createFolder(name, parent ?? undefined)
	}

	async function renameAsset(asset: MediaAsset): Promise<void> {
		const extension = extensionOf(asset)
		const hasExtension = asset.name.toLowerCase().endsWith(`.${extension}`)
		const name = await nameDialog.open({
			title: t('dms_media.dialogs.rename.title'),
			description: t('dms_media.dialogs.rename.file_description'),
			icon: 'i-ph-pencil-simple',
			label: t('dms_media.dialogs.rename.label'),
			initial: baseNameOf(asset),
			suffix: hasExtension ? `.${extension}` : undefined,
			confirmLabel: t('dms_media.dialogs.rename.confirm'),
		})
		if (name) await library.actions.renameAsset(asset, name)
	}

	async function renameFolder(folder: MediaFolder): Promise<void> {
		if (folder.bound) return showLocked(folder)
		const name = await nameDialog.open({
			title: t('dms_media.dialogs.rename.folder_title'),
			icon: 'i-ph-pencil-simple',
			label: t('dms_media.dialogs.rename.label'),
			initial: folder.name,
			confirmLabel: t('dms_media.dialogs.rename.confirm'),
		})
		if (name) await library.actions.renameFolder(folder, name)
	}

	async function moveAssets(assets: MediaAsset[]): Promise<void> {
		if (assets.length === 0) return
		const target = await moveDialog.open({
			title: t('dms_media.dialogs.move.files_title', { count: assets.length }, assets.length),
			folders: library.tree.folders.value,
			currentFolderId: assets.length === 1 ? assets[0]!.folderId : null,
			right: 'write',
		})
		if (target) await library.actions.moveAssets(assets, target)
	}

	async function moveFolder(folder: MediaFolder): Promise<void> {
		if (folder.bound) return showLocked(folder)
		const excluded = [folder.id, ...library.tree.descendantsOf(folder.id).map((child) => child.id)]
		const target = await moveDialog.open({
			title: t('dms_media.dialogs.move.folder_title', { name: folder.name }),
			folders: library.tree.folders.value,
			currentFolderId: folder.parentId,
			excludedIds: excluded,
			right: 'manage',
			allowRoot: true,
			rootAllowed: Boolean(library.tree.tree.value?.root.manage) && folder.parentId !== null,
		})
		if (target !== undefined) await library.actions.moveFolder(folder, target)
	}

	async function deleteAssets(assets: MediaAsset[]): Promise<void> {
		if (assets.length === 0) return
		const choice = await deleteDialog.open({
			assets,
			canMakePrivate: assets.every(canChangeVisibility),
		})
		if (choice === 'delete') await library.actions.deleteAssets(assets)
		if (choice === 'private') {
			const publicAssets = assets.filter((asset) => asset.effectiveVisibility === 'public')
			await library.actions.setAssetsVisibility(publicAssets, 'private')
		}
	}

	async function changeVisibility(assets: MediaAsset[]): Promise<void> {
		if (assets.length === 0) return
		const visibility = await visibilityDialog.open({
			count: assets.length,
			current: assets.length === 1 ? assets[0]!.visibility : undefined,
		})
		if (visibility) await library.actions.setAssetsVisibility(assets, visibility)
	}

	async function deleteFolder(folder: MediaFolder): Promise<void> {
		if (folder.bound) return showLocked(folder)
		const impact = await library.api.folderImpact(folder.id)
		await confirm({
			title: t('dms_media.dialogs.delete_folder.title', { name: folder.name }),
			description: t('dms_media.dialogs.delete_folder.description'),
			color: 'error',
			icon: 'i-ph-trash',
			confirmLabel: t('dms_media.dialogs.delete_folder.confirm'),
			confirmText: folder.name,
			impact: [
				{ icon: 'i-ph-folders', label: t('dms_media.dialogs.delete_folder.subfolders'), count: impact.subfolders },
				{ icon: 'i-ph-files', label: t('dms_media.dialogs.delete_folder.files'), count: impact.files },
				{ icon: 'i-ph-hard-drives', label: t('dms_media.dialogs.delete_folder.freed'), count: format.formatBytes(impact.size) },
				...(impact.publicFiles > 0
					? [{ icon: 'i-ph-globe', label: t('dms_media.dialogs.delete_folder.public_files'), count: impact.publicFiles }]
					: []),
			],
			blocked: impact.linkedSubfolders > 0,
			onConfirm: async () => {
				await library.actions.deleteFolder(folder)
			},
		})
	}

	function showLocked(folder: MediaFolder): Promise<void> {
		return lockedDialog.open({ folder }).then(() => undefined)
	}

	function showShortcuts(): void {
		void shortcutsDialog.open()
	}

	async function upload(folderId?: string | null): Promise<void> {
		const target = folderId
			? library.tree.foldersById.value.get(folderId)
			: library.currentFolder.value
		if (target?.rights.write) return handlers.pickFiles(target.id, target.name)
		const chosen = await destinationDialog.open({
			folders: library.tree.folders.value,
			initialId: prefs.value.lastFolderId,
		})
		const destination = chosen ? library.tree.foldersById.value.get(chosen) : undefined
		if (!destination) return
		updatePrefs({ lastFolderId: destination.id })
		handlers.pickFiles(destination.id, destination.name)
	}

	async function copyLink(asset: MediaAsset): Promise<void> {
		const origin = useDmsRuntimeConfig().public.dms.baseURL ?? ''
		await navigator.clipboard.writeText(`${origin}${asset.url}`)
		library.toast.add({ title: t('dms_media.toasts.link_copied'), color: 'success', icon: 'i-ph-link' })
	}

	function openDetails(asset: MediaAsset): void {
		if (isBrowse) void navigateDms(fileLink(asset.id))
	}

	function edit(asset: MediaAsset): void {
		if (isBrowse && isEditableAsset(asset) && canWriteAsset(asset)) void navigateDms(editorLink(asset.id))
	}

	const later = (run: () => unknown) => async () => {
		await afterMenusClose()
		await run()
	}

	function fileMenu(asset: MediaAsset): DropdownMenuItem[][] {
		const assets = library.selection.selectedIds.value.has(asset.id) && library.selection.selectedAssets.value.length > 1
			? library.selection.selectedAssets.value
			: [asset]
		const canWrite = assets.every(canWriteAsset)
		const groups: DropdownMenuItem[][] = [
			[
				{ label: t('dms_media.actions.preview'), icon: 'i-ph-arrows-out-simple', kbds: ['space'], onSelect: later(() => handlers.preview(asset)) },
				...(isBrowse
					? [{ label: t('dms_media.actions.open_details'), icon: 'i-ph-arrow-square-out', kbds: ['enter'], onSelect: () => openDetails(asset) }]
					: []),
				...(isBrowse && isEditableAsset(asset) && canWrite
					? [{ label: t('dms_media.actions.edit_image'), icon: 'i-ph-crop', kbds: ['e'], onSelect: () => edit(asset) }]
					: []),
			],
			[
				{ label: t('dms_media.actions.copy_link'), icon: 'i-ph-link', onSelect: () => void copyLink(asset) },
				{ label: t('dms_media.actions.download'), icon: 'i-ph-download-simple', onSelect: () => void library.actions.downloadAsset(asset) },
				{
					label: asset.starred ? t('dms_media.actions.unstar') : t('dms_media.actions.star'),
					icon: asset.starred ? 'i-ph-star-fill' : 'i-ph-star',
					onSelect: () => void library.actions.toggleStar(asset, 'asset'),
				},
			],
		]
		if (isBrowse && canWrite)
			groups.push([
				...(assets.length === 1
					? [{ label: t('dms_media.actions.rename'), icon: 'i-ph-pencil-simple', kbds: ['f2'], onSelect: later(() => renameAsset(asset)) }]
					: []),
				{ label: t('dms_media.actions.move'), icon: 'i-ph-arrows-out-cardinal', kbds: ['m'], onSelect: later(() => moveAssets(assets)) },
				...(assets.every(canChangeVisibility)
					? [{ label: t('dms_media.actions.visibility'), icon: 'i-ph-globe', onSelect: later(() => changeVisibility(assets)) }]
					: []),
			])
		if (isBrowse && canWrite)
			groups.push([
				{ label: t('dms_media.actions.delete'), icon: 'i-ph-trash', color: 'error', kbds: ['delete'], onSelect: later(() => deleteAssets(assets)) },
			])
		return groups
	}

	function lockedItem(label: string, icon: string): DropdownMenuItem {
		return { label, icon, disabled: true, suffix: t('dms_media.markers.locked') }
	}

	function folderMenu(folder: MediaFolder): DropdownMenuItem[][] {
		const groups: DropdownMenuItem[][] = [
			[
				{ label: t('dms_media.actions.open'), icon: 'i-ph-folder-open', kbds: ['enter'], onSelect: () => void library.openFolder(folder.id) },
				...(folder.rights.write
					? [{ label: t('dms_media.actions.upload_here'), icon: 'i-ph-upload-simple', kbds: ['u'], onSelect: later(() => upload(folder.id)) }]
					: []),
				...(folder.rights.manage && !folder.bound
					? [{ label: t('dms_media.actions.new_subfolder'), icon: 'i-ph-folder-plus', kbds: ['shift', 'n'], onSelect: later(() => newFolder(folder.id)) }]
					: []),
				{
					label: folder.starred ? t('dms_media.actions.unstar') : t('dms_media.actions.star'),
					icon: folder.starred ? 'i-ph-star-fill' : 'i-ph-star',
					onSelect: () => void library.actions.toggleStar(folder, 'folder'),
				},
			],
		]
		if (!isBrowse || !folder.rights.manage) return groups
		if (folder.bound) {
			groups.push(
				[lockedItem(t('dms_media.actions.rename'), 'i-ph-pencil-simple'), lockedItem(t('dms_media.actions.move'), 'i-ph-arrows-out-cardinal'), lockedItem(t('dms_media.actions.delete_folder'), 'i-ph-trash')],
				[{ label: t('dms_media.actions.why_locked'), icon: 'i-ph-info', onSelect: later(() => showLocked(folder)) }],
			)
			return groups
		}
		groups.push([
			{ label: t('dms_media.actions.rename'), icon: 'i-ph-pencil-simple', kbds: ['f2'], onSelect: later(() => renameFolder(folder)) },
			{ label: t('dms_media.actions.move'), icon: 'i-ph-arrows-out-cardinal', kbds: ['m'], onSelect: later(() => moveFolder(folder)) },
			...(canManagePermissions.value
				? [{ label: t('dms_media.actions.access'), icon: 'i-ph-shield-check', onSelect: () => void navigateDms(accessLink(folder.id)) }]
				: []),
		])
		groups.push([
			{ label: t('dms_media.actions.delete_folder'), icon: 'i-ph-trash', color: 'error', onSelect: later(() => deleteFolder(folder)) },
		])
		return groups
	}

	return {
		preview: handlers.preview,
		canWriteAsset,
		canChangeVisibility,
		canManagePermissions,
		newFolder,
		renameAsset,
		renameFolder,
		moveAssets,
		moveFolder,
		deleteAssets,
		deleteFolder,
		changeVisibility,
		showLocked,
		showShortcuts,
		upload,
		copyLink,
		openDetails,
		edit,
		fileMenu,
		folderMenu,
	}
}

export type ExplorerCommands = ReturnType<typeof useExplorerCommands>

const COMMANDS_KEY: InjectionKey<ExplorerCommands> = Symbol('dms-media-explorer-commands')

export function provideExplorerCommands(commands: ExplorerCommands): void {
	provide(COMMANDS_KEY, commands)
}

export function useExplorerContext() {
	const commands = inject(COMMANDS_KEY)
	if (!commands) throw new Error('useExplorerContext() needs a media explorer above it')
	return { library: useMediaLibrary(), commands }
}
