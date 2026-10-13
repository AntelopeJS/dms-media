import type { DropdownMenuItem } from '@nuxt/ui'
import type { MediaAsset, MediaFolder } from '../../types/media'
import type { MediaLibrary } from './useMediaLibrary'

const MENU_SETTLE_MS = 80

type AssetCommand = (asset: MediaAsset) => unknown
type AssetsCommand = (assets: MediaAsset[]) => unknown
type FolderCommand = (folder: MediaFolder) => unknown

/** The commands the context menus offer. */
export interface MenuCommands {
	preview: AssetCommand
	openDetails: AssetCommand
	edit: AssetCommand
	copyLink: AssetCommand
	renameAsset: AssetCommand
	moveAssets: AssetsCommand
	changeVisibility: AssetsCommand
	deleteAssets: AssetsCommand
	canWriteAsset: (asset: MediaAsset) => boolean
	canChangeVisibility: (asset: MediaAsset) => boolean
	canChangeFolderVisibility: (folder: MediaFolder) => boolean
	upload: (folderId?: string | null) => unknown
	newFolder: (parentId?: string | null) => unknown
	showLocked: FolderCommand
	renameFolder: FolderCommand
	moveFolder: FolderCommand
	changeFolderVisibility: FolderCommand
	deleteFolder: FolderCommand
}

function afterMenusClose(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, MENU_SETTLE_MS))
}

/** Runs a command once the menu closed, so its dialog takes the focus. */
export const afterMenu = (run: () => unknown) => async () => {
	await afterMenusClose()
	await run()
}

/** The context menus of files and folders, built from the commands. */
export function createExplorerMenus(library: MediaLibrary, commands: MenuCommands) {
	const { t } = library
	const isBrowse = library.mode === 'browse'

	function fileViewItems(asset: MediaAsset, canWrite: boolean): DropdownMenuItem[] {
		return [
			{ label: t('dms_media.actions.preview'), icon: 'i-ph-arrows-out-simple', kbds: ['space'], onSelect: afterMenu(() => commands.preview(asset)) },
			...(isBrowse
				? [{ label: t('dms_media.actions.open_details'), icon: 'i-ph-arrow-square-out', kbds: ['enter'], onSelect: () => commands.openDetails(asset) }]
				: []),
			...(isBrowse && isEditableAsset(asset) && canWrite
				? [{ label: t('dms_media.actions.edit_image'), icon: 'i-ph-crop', kbds: ['e'], onSelect: () => commands.edit(asset) }]
				: []),
		]
	}

	function fileShareItems(asset: MediaAsset): DropdownMenuItem[] {
		return [
			{ label: t('dms_media.actions.copy_link'), icon: 'i-ph-link', onSelect: () => void commands.copyLink(asset) },
			{ label: t('dms_media.actions.download'), icon: 'i-ph-download-simple', onSelect: () => void library.actions.downloadAsset(asset) },
			{
				label: asset.starred ? t('dms_media.actions.unstar') : t('dms_media.actions.star'),
				icon: asset.starred ? 'i-ph-star-fill' : 'i-ph-star',
				onSelect: () => void library.actions.toggleStar(asset, 'asset'),
			},
		]
	}

	function singleFileMenu(asset: MediaAsset): DropdownMenuItem[][] {
		const canWrite = commands.canWriteAsset(asset)
		const groups = [fileViewItems(asset, canWrite), fileShareItems(asset)]
		if (!isBrowse || !canWrite) return groups
		return [
			...groups,
			[
				{ label: t('dms_media.actions.rename'), icon: 'i-ph-pencil-simple', kbds: ['f2'], onSelect: afterMenu(() => commands.renameAsset(asset)) },
				{ label: t('dms_media.actions.move'), icon: 'i-ph-arrows-out-cardinal', kbds: ['m'], onSelect: afterMenu(() => commands.moveAssets([asset])) },
				...(commands.canChangeVisibility(asset)
					? [{ label: t('dms_media.actions.visibility_ellipsis'), icon: 'i-ph-globe', onSelect: afterMenu(() => commands.changeVisibility([asset])) }]
					: []),
			],
			[{ label: t('dms_media.actions.delete'), icon: 'i-ph-trash', color: 'error', kbds: ['delete'], onSelect: afterMenu(() => commands.deleteAssets([asset])) }],
		]
	}

	/** Every entry acts on the whole selection, and says how many files. */
	function selectionMenu(assets: MediaAsset[]): DropdownMenuItem[][] {
		const count = assets.length
		const isEveryStarred = assets.every((asset) => asset.starred)
		const groups: DropdownMenuItem[][] = [
			[
				{ label: t('dms_media.actions.download_zip_count', { count }, count), icon: 'i-ph-file-zip', onSelect: () => void library.actions.downloadZip(assets) },
				{
					label: t(isEveryStarred ? 'dms_media.actions.unstar_count' : 'dms_media.actions.star_count', { count }, count),
					icon: isEveryStarred ? 'i-ph-star-fill' : 'i-ph-star',
					onSelect: () => void library.actions.starAssets(assets),
				},
			],
		]
		if (!isBrowse || !assets.every(commands.canWriteAsset)) return groups
		return [
			...groups,
			[
				{ label: t('dms_media.actions.move_count', { count }, count), icon: 'i-ph-arrows-out-cardinal', kbds: ['m'], onSelect: afterMenu(() => commands.moveAssets(assets)) },
				...(assets.every(commands.canChangeVisibility)
					? [{ label: t('dms_media.actions.visibility_count', { count }, count), icon: 'i-ph-globe', onSelect: afterMenu(() => commands.changeVisibility(assets)) }]
					: []),
			],
			[{ label: t('dms_media.actions.delete_count', { count }, count), icon: 'i-ph-trash', color: 'error', kbds: ['delete'], onSelect: afterMenu(() => commands.deleteAssets(assets)) }],
		]
	}

	function fileMenu(asset: MediaAsset): DropdownMenuItem[][] {
		const selected = library.selection.selectedAssets.value
		const isInSelection = library.selection.selectedIds.value.has(asset.id) && selected.length > 1
		return isInSelection ? selectionMenu(selected) : singleFileMenu(asset)
	}

	function lockedItem(label: string, icon: string): DropdownMenuItem {
		return { label, icon, disabled: true, suffix: t('dms_media.markers.locked') }
	}

	function folderBasics(folder: MediaFolder): DropdownMenuItem[] {
		return [
			{ label: t('dms_media.actions.open'), icon: 'i-ph-folder-open', onSelect: () => void library.openFolder(folder.id) },
			...(folder.rights.write
				? [{ label: t('dms_media.actions.upload_here'), icon: 'i-ph-upload-simple', onSelect: afterMenu(() => commands.upload(folder.id)) }]
				: []),
			...(folder.rights.manage && !folder.bound
				? [{ label: t('dms_media.actions.new_subfolder'), icon: 'i-ph-folder-plus', onSelect: afterMenu(() => commands.newFolder(folder.id)) }]
				: []),
			{
				label: folder.starred ? t('dms_media.actions.unstar') : t('dms_media.actions.star'),
				icon: folder.starred ? 'i-ph-star-fill' : 'i-ph-star',
				onSelect: () => void library.actions.toggleStar(folder, 'folder'),
			},
			{ label: t('dms_media.actions.download_folder'), icon: 'i-ph-file-zip', onSelect: () => void library.actions.downloadFolder(folder) },
		]
	}

	function folderManagement(folder: MediaFolder): DropdownMenuItem[][] {
		const visibility = commands.canChangeFolderVisibility(folder)
			? [{ label: t('dms_media.actions.visibility_ellipsis'), icon: 'i-ph-globe', onSelect: afterMenu(() => commands.changeFolderVisibility(folder)) }]
			: []
		if (folder.bound)
			return [
				[lockedItem(t('dms_media.actions.rename'), 'i-ph-pencil-simple'), lockedItem(t('dms_media.actions.move'), 'i-ph-arrows-out-cardinal'), ...visibility, lockedItem(t('dms_media.actions.delete_folder'), 'i-ph-trash')],
				[{ label: t('dms_media.actions.why_locked'), icon: 'i-ph-info', onSelect: afterMenu(() => commands.showLocked(folder)) }],
			]
		return [
			[
				{ label: t('dms_media.actions.rename'), icon: 'i-ph-pencil-simple', onSelect: afterMenu(() => commands.renameFolder(folder)) },
				{ label: t('dms_media.actions.move'), icon: 'i-ph-arrows-out-cardinal', onSelect: afterMenu(() => commands.moveFolder(folder)) },
				...visibility,
			],
			[{ label: t('dms_media.actions.delete_folder'), icon: 'i-ph-trash', color: 'error', onSelect: afterMenu(() => commands.deleteFolder(folder)) }],
		]
	}

	function folderMenu(folder: MediaFolder): DropdownMenuItem[][] {
		const groups: DropdownMenuItem[][] = [folderBasics(folder)]
		if (!isBrowse || !folder.rights.manage) return groups
		return [...groups, ...folderManagement(folder)]
	}

	return { fileMenu, folderMenu }
}
