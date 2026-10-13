import type { InjectionKey } from 'vue'
import DeleteFilesDialog from '../../components/dialogs/DeleteFilesDialog.vue'
import DestinationDialog from '../../components/dialogs/DestinationDialog.vue'
import LockedDialog from '../../components/dialogs/LockedDialog.vue'
import MoveDialog from '../../components/dialogs/MoveDialog.vue'
import NameDialog from '../../components/dialogs/NameDialog.vue'
import ShortcutsDialog from '../../components/dialogs/ShortcutsDialog.vue'
import VisibilityDialog from '../../components/dialogs/VisibilityDialog.vue'
import type { MediaAsset, MediaFolder } from '../../types/media'
import { createExplorerMenus } from './explorerMenus'
import type { MediaLibrary, NameOutcome } from './useMediaLibrary'
import { useRecentDestinations } from './useRecentDestinations'

export interface ExplorerHandlers {
	/** Opens the OS file dialog; the shell owns the hidden input. */
	pickFiles: (folderId: string, folderName: string) => void
	/** Opens the preview lightbox on a file. */
	preview: (asset: MediaAsset) => void
}

function sharedValue<Value>(values: Value[]): Value | undefined {
	return new Set(values).size === 1 ? values[0] : undefined
}

/** Every command of the explorer, its dialogs and the menus that offer them. */
export function useExplorerCommands(library: MediaLibrary, handlers: ExplorerHandlers) {
	const overlay = useOverlay()
	const { confirm } = useConfirm()
	const { t } = library
	const format = useMediaFormat()
	const assetLink = useAssetLink()
	const recentDestinations = useRecentDestinations()
	const { prefs, update: updatePrefs } = useMediaPrefs()
	const nameDialog = overlay.create(NameDialog)
	const moveDialog = overlay.create(MoveDialog)
	const deleteDialog = overlay.create(DeleteFilesDialog)
	const visibilityDialog = overlay.create(VisibilityDialog)
	const destinationDialog = overlay.create(DestinationDialog)
	const shortcutsDialog = overlay.create(ShortcutsDialog)
	const lockedDialog = overlay.create(LockedDialog)
	const isBrowse = library.mode === 'browse'
	const isOwner = computed(
		() => library.tree.tree.value?.isOwner ?? false,
	)

	function folderOf(asset: MediaAsset): MediaFolder | undefined {
		return library.tree.foldersById.value.get(asset.folderId)
	}

	function canWriteAsset(asset: MediaAsset): boolean {
		return Boolean(folderOf(asset)?.rights.write)
	}

	function canChangeVisibility(asset: MediaAsset): boolean {
		return Boolean(folderOf(asset)?.rights.manage) && isOwner.value
	}

	function canChangeFolderVisibility(folder: MediaFolder): boolean {
		return isBrowse && folder.rights.manage && isOwner.value
	}

	function siblingNames(parentId: string | null, exceptId?: string): string[] {
		return library.tree
			.childrenOf(parentId)
			.filter((folder) => folder.id !== exceptId)
			.map((folder) => folder.name)
	}

	function neighbourNames(asset: MediaAsset): string[] {
		const current = library.listing.location.value
		if (current.kind !== 'folder' || current.folderId !== asset.folderId) return []
		return library.listing.assets.value
			.filter((other) => other.id !== asset.id)
			.map((other) => other.name)
	}

	function fieldErrorOf(write: Promise<NameOutcome>): Promise<string | undefined> {
		return write.then((outcome) => outcome.fieldError)
	}

	/** Asks for a new folder's name: in `parentId`, at the root for `null`, here otherwise. */
	async function newFolder(parentId?: string | null): Promise<void> {
		const parentKey = parentId === undefined ? (library.currentFolder.value?.id ?? null) : parentId
		const parent = parentKey ? library.tree.foldersById.value.get(parentKey) : undefined
		if (parent?.bound) return showLocked(parent)
		await nameDialog.open({
			title: t('dms_media.dialogs.new_folder.title'),
			description: parent
				? t('dms_media.dialogs.new_folder.inside', { name: parent.name })
				: t('dms_media.dialogs.new_folder.at_root'),
			icon: 'i-ph-folder-plus',
			label: t('dms_media.dialogs.new_folder.label'),
			confirmLabel: t('dms_media.dialogs.new_folder.confirm'),
			takenNames: siblingNames(parentKey),
			submit: (name: string) => fieldErrorOf(library.actions.createFolder(name, parentKey ?? undefined)),
		})
	}

	async function renameAsset(asset: MediaAsset): Promise<void> {
		const extension = extensionOf(asset)
		const hasExtension = asset.name.toLowerCase().endsWith(`.${extension}`)
		await nameDialog.open({
			title: t('dms_media.dialogs.rename.title'),
			description: t('dms_media.dialogs.rename.file_description'),
			icon: 'i-ph-pencil-simple',
			label: t('dms_media.dialogs.rename.label'),
			initial: baseNameOf(asset),
			suffix: hasExtension ? `.${extension}` : undefined,
			confirmLabel: t('dms_media.dialogs.rename.confirm'),
			takenNames: neighbourNames(asset),
			submit: (name: string) => fieldErrorOf(library.actions.renameAsset(asset, name)),
		})
	}

	async function renameFolder(folder: MediaFolder): Promise<void> {
		if (folder.bound) return showLocked(folder)
		await nameDialog.open({
			title: t('dms_media.dialogs.rename.folder_title'),
			icon: 'i-ph-pencil-simple',
			label: t('dms_media.dialogs.rename.label'),
			initial: folder.name,
			confirmLabel: t('dms_media.dialogs.rename.confirm'),
			takenNames: siblingNames(folder.parentId, folder.id),
			submit: (name: string) => fieldErrorOf(library.actions.renameFolder(folder, name)),
		})
	}

	async function createFolderForMove(name: string, parentId: string | null): Promise<NameOutcome> {
		const outcome = await library.actions.createFolder(name, parentId ?? undefined)
		if (outcome.id) moveDialog.patch({ folders: library.tree.folders.value })
		return outcome
	}

	async function moveAssets(assets: MediaAsset[]): Promise<void> {
		if (assets.length === 0) return
		const sharedFolderId = sharedValue(assets.map((asset) => asset.folderId)) ?? null
		const target = await moveDialog.open({
			title: t('dms_media.dialogs.move.files_title', { count: assets.length }, assets.length),
			folders: library.tree.folders.value,
			currentFolderId: sharedFolderId,
			revealId: sharedFolderId ?? library.currentFolder.value?.id ?? null,
			right: 'write',
			recentIds: [...recentDestinations.ids.value],
			createFolder: createFolderForMove,
		})
		if (!target) return
		recentDestinations.remember(target)
		await library.actions.moveAssets(assets, target)
	}

	async function moveFolder(folder: MediaFolder): Promise<void> {
		if (folder.bound) return showLocked(folder)
		const excluded = [folder.id, ...library.tree.descendantsOf(folder.id).map((child) => child.id)]
		const target = await moveDialog.open({
			title: t('dms_media.dialogs.move.folder_title', { name: folder.name }),
			folders: library.tree.folders.value,
			currentFolderId: folder.parentId,
			revealId: folder.parentId,
			excludedIds: excluded,
			right: 'manage',
			refuseBound: true,
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
		if (choice !== 'private') return
		const publicAssets = assets.filter((asset) => asset.effectiveVisibility === 'public')
		await library.actions.setAssetsVisibility(publicAssets, 'private', 'dms_media.toasts.made_private_instead')
	}

	async function changeVisibility(assets: MediaAsset[]): Promise<void> {
		if (assets.length === 0) return
		const visibility = await visibilityDialog.open({
			count: assets.length,
			current: sharedValue(assets.map((asset) => asset.visibility)),
			folderVisibility: sharedValue(assets.map((asset) => folderOf(asset)?.visibility)),
		})
		if (visibility) await library.actions.setAssetsVisibility(assets, visibility)
	}

	async function changeFolderVisibility(folder: MediaFolder): Promise<void> {
		if (!canChangeFolderVisibility(folder)) return
		const visibility = await visibilityDialog.open({ folderName: folder.name, current: folder.visibility })
		if (visibility === 'private' || visibility === 'public')
			await library.actions.setFolderVisibility(folder, visibility)
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

	async function folderById(folderId: string): Promise<MediaFolder | undefined> {
		const known = library.tree.foldersById.value.get(folderId)
		if (known) return known
		await library.tree.refresh()
		return library.tree.foldersById.value.get(folderId)
	}

	async function upload(folderId?: string | null): Promise<void> {
		const target = folderId
			? library.tree.foldersById.value.get(folderId)
			: library.currentFolder.value
		if (target?.rights.write) return handlers.pickFiles(target.id, target.name)
		const chosen = await destinationDialog.open({
			folders: library.tree.folders.value,
			initialId: prefs.value.lastFolderId,
			accept: library.accept,
		})
		const destination = chosen ? await folderById(chosen) : undefined
		if (!destination) return
		updatePrefs({ lastFolderId: destination.id })
		handlers.pickFiles(destination.id, destination.name)
	}

	function copyLink(asset: MediaAsset): Promise<void> {
		const makePublic = () => library.actions.setAssetsVisibility([asset], 'public')
		return assetLink.copyLink(asset, canChangeVisibility(asset) ? { makePublic } : {})
	}

	function openDetails(asset: MediaAsset): void {
		if (!isBrowse) return
		const { sort, direction, type } = library.listing.filters.value
		void navigateDms(fileLink(asset.id, { sort, direction, type }))
	}

	function edit(asset: MediaAsset): void {
		if (isBrowse && isEditableAsset(asset) && canWriteAsset(asset)) void navigateDms(editorLink(asset.id))
	}

	const commands = {
		preview: handlers.preview,
		canWriteAsset,
		canChangeVisibility,
		canChangeFolderVisibility,
		newFolder,
		renameAsset,
		renameFolder,
		moveAssets,
		moveFolder,
		deleteAssets,
		deleteFolder,
		changeVisibility,
		changeFolderVisibility,
		showLocked,
		showShortcuts,
		upload,
		copyLink,
		openDetails,
		edit,
	}
	return { ...commands, ...createExplorerMenus(library, commands) }
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
