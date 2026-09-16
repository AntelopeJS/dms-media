import type { ComputedRef, InjectionKey } from "vue";
import type { ContextMenuItem, TreeItem } from "@nuxt/ui";
import {
	FileExplorerItemType,
	type FileItem,
	type FileItemPublic,
	type FolderItem,
	type FolderItemPublic,
	type MockItemPublic,
} from "../../utils/finder/models";
import { resolveFileGroup } from "../../utils/finder/filegroup";
import { formatFileSize } from "../../utils/finder/filesize";

export type PickerViewMode = "grid" | "list" | "columns";
export type PickerSortKey = "name" | "type" | "size" | "date";
export type PickerSortDirection = "asc" | "desc";
export type PickerLocationKind = "folder" | "recents";

export interface PickerLocation {
	kind: PickerLocationKind;
	folderId: string | null;
}

export interface PickerSort {
	key: PickerSortKey;
	direction: PickerSortDirection;
}

export interface PickerExplorerOptions {
	browse: boolean;
	multiple: boolean;
	mimetypes: string[];
	initialSelectedIds: string[];
	initialBinding?: string;
	onConfirm: (files: FileItemPublic[]) => void;
	onCancel: () => void;
}

export const PICKER_ZOOM_MIN = 1;
export const PICKER_ZOOM_MAX = 5;
export const PICKER_ROOT_TREE_VALUE = "__picker_root__";
export const PICKER_INTERNAL_DRAG_TYPE = "application/x-dms-media-item";
export const PICKER_DISMISS_GRACE_MS = 500;
const PICKER_ZOOM_DEFAULT = 2;
const PICKER_TILE_SIZES: Record<number, string> = {
	1: "96px",
	2: "120px",
	3: "148px",
	4: "182px",
	5: "220px",
};
const RECENT_FILES_LIMIT = 20;
const MENU_CLOSE_DELAY_MS = 150;
const ROOT_LOCATION: PickerLocation = { kind: "folder", folderId: null };

function afterMenuCloses(action: () => void): void {
	setTimeout(action, MENU_CLOSE_DELAY_MS);
}

export function isPickerFile(item: MockItemPublic): item is FileItemPublic {
	return item.type === FileExplorerItemType.File;
}

const PICKER_SORT_ACCESSORS: Record<
	PickerSortKey,
	(item: MockItemPublic) => string | number
> = {
	name: (item) => item.name.toLowerCase(),
	type: (item) =>
		isPickerFile(item) ? resolveFileGroup(item.mimetype).id : "",
	size: (item) => (isPickerFile(item) ? item.size : -1),
	date: (item) => item.updatedAt.getTime(),
};

interface PickerNavigation {
	location: ComputedRef<PickerLocation>;
	canGoBack: ComputedRef<boolean>;
	canGoForward: ComputedRef<boolean>;
	navigate: (next: PickerLocation) => void;
	reset: (start: PickerLocation) => void;
	goBack: () => void;
	goForward: () => void;
}

function createPickerNavigation(onChange: () => void): PickerNavigation {
	const history = ref<PickerLocation[]>([ROOT_LOCATION]);
	const index = ref(0);
	const location = computed(() => history.value[index.value] ?? ROOT_LOCATION);
	const canGoBack = computed(() => index.value > 0);
	const canGoForward = computed(() => index.value < history.value.length - 1);

	function navigate(next: PickerLocation): void {
		history.value = [...history.value.slice(0, index.value + 1), next];
		index.value += 1;
		onChange();
	}

	function reset(start: PickerLocation): void {
		history.value = [start];
		index.value = 0;
	}

	function goBack(): void {
		if (!canGoBack.value) return;
		index.value -= 1;
		onChange();
	}

	function goForward(): void {
		if (!canGoForward.value) return;
		index.value += 1;
		onChange();
	}

	return { location, canGoBack, canGoForward, navigate, reset, goBack, goForward };
}

function createPickerExplorer(options: PickerExplorerOptions) {
	const { t } = useI18n();
	const store = useFinderStore();
	const api = useMediaApi();

	const searchQuery = ref("");
	const groupFilter = ref<string | null>(null);
	const sort = ref<PickerSort>({ key: "name", direction: "asc" });
	const viewMode = ref<PickerViewMode>("grid");
	const zoom = ref(PICKER_ZOOM_DEFAULT);
	const renamingId = ref<string | null>(null);
	const isPreviewOpen = ref(false);
	const contextTarget = ref<MockItemPublic | null>(null);
	const lightboxFileId = ref<string | null>(null);
	const editingFileId = ref<string | null>(null);
	const deletingFileId = ref<string | null>(null);
	const movingItemId = ref<string | null>(null);
	const draggingItemId = ref<string | null>(null);
	const dropTargetId = ref<string | null>(null);
	let editResolver: ((changed: boolean) => void) | null = null;
	const selectedIds = ref<string[]>([...options.initialSelectedIds]);
	const focusedId = ref<string | null>(options.initialSelectedIds[0] ?? null);

	const navigation = createPickerNavigation(() => {
		searchQuery.value = "";
	});
	const { location, canGoBack, canGoForward, goBack, goForward } = navigation;

	const normalizedQuery = computed(() => searchQuery.value.trim().toLowerCase());
	const isSearching = computed(() => normalizedQuery.value.length > 0);
	const isFolderLocation = computed(() => location.value.kind === "folder");

	const currentFolder = computed(() =>
		location.value.folderId
			? store.map.value.folders.get(location.value.folderId)
			: undefined,
	);

	const currentPath = computed<FolderItemPublic[]>(() => {
		const folder = currentFolder.value;
		if (!folder) return [];
		const ancestors = folder.ancestors
			.map((id) => store.map.value.folders.get(id))
			.filter((entry): entry is FolderItem => entry !== undefined);
		return [...ancestors, folder];
	});

	const recentFiles = computed(() =>
		[...store.items.value.files]
			.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
			.slice(0, RECENT_FILES_LIMIT),
	);

	function folderChildren(folderId: string | null): MockItemPublic[] {
		return [
			...store.getSubfoldersFromFolderId(folderId),
			...store.getFilesFromFolderId(folderId),
		];
	}

	function locationItems(): MockItemPublic[] {
		if (isSearching.value) {
			return store.items.value.files.filter((file) =>
				file.name.toLowerCase().includes(normalizedQuery.value),
			);
		}
		if (location.value.kind === "recents") return [...recentFiles.value];
		return folderChildren(location.value.folderId);
	}

	function matchesGroupFilter(item: MockItemPublic): boolean {
		if (!groupFilter.value || !isPickerFile(item)) return true;
		return resolveFileGroup(item.mimetype).id === groupFilter.value;
	}

	function compareItems(a: MockItemPublic, b: MockItemPublic): number {
		if (a.type !== b.type) {
			return a.type === FileExplorerItemType.Folder ? -1 : 1;
		}
		const accessor = PICKER_SORT_ACCESSORS[sort.value.key];
		const left = accessor(a);
		const right = accessor(b);
		const order = left < right ? -1 : left > right ? 1 : 0;
		return sort.value.direction === "asc" ? order : -order;
	}

	const visibleItems = computed(() =>
		locationItems().filter(matchesGroupFilter).sort(compareItems),
	);

	function itemsForFolder(folderId: string | null): MockItemPublic[] {
		return folderChildren(folderId).sort(compareItems);
	}

	const isColumnsAvailable = computed(
		() => !isSearching.value && isFolderLocation.value,
	);
	const effectiveViewMode = computed<PickerViewMode>(() =>
		viewMode.value === "columns" && !isColumnsAvailable.value
			? "list"
			: viewMode.value,
	);
	const tileSize = computed(
		() => PICKER_TILE_SIZES[zoom.value] ?? PICKER_TILE_SIZES[PICKER_ZOOM_DEFAULT],
	);

	function toggleSort(key: PickerSortKey): void {
		const flipped = sort.value.direction === "asc" ? "desc" : "asc";
		sort.value = { key, direction: sort.value.key === key ? flipped : "asc" };
	}

	const selectedFiles = computed(() =>
		selectedIds.value
			.map((id) => store.map.value.files.get(id))
			.filter((file): file is FileItem => file !== undefined),
	);
	const selectionSize = computed(() =>
		selectedFiles.value.reduce((total, file) => total + file.size, 0),
	);
	const focusedFile = computed(() =>
		focusedId.value ? store.map.value.files.get(focusedId.value) : undefined,
	);

	function isSelected(item: MockItemPublic): boolean {
		return selectedIds.value.includes(item.id);
	}

	function matchesAcceptedTypes(file: FileItemPublic): boolean {
		if (!options.mimetypes.length) return true;
		return options.mimetypes.some((pattern) =>
			file.mimetype.startsWith(pattern.replace(/\*$/, "")),
		);
	}

	function isDisabled(item: MockItemPublic): boolean {
		return isPickerFile(item) && !matchesAcceptedTypes(item);
	}

	function toggleSelection(file: FileItemPublic): void {
		const alreadySelected = selectedIds.value.includes(file.id);
		if (!options.multiple) {
			selectedIds.value = alreadySelected ? [] : [file.id];
		} else {
			selectedIds.value = alreadySelected
				? selectedIds.value.filter((id) => id !== file.id)
				: [...selectedIds.value, file.id];
		}
		focusedId.value = file.id;
	}

	function openFolder(folderId: string | null): void {
		navigation.navigate({ kind: "folder", folderId });
	}

	function showRecents(): void {
		navigation.navigate({ kind: "recents", folderId: null });
	}

	function rangeReference(
		anchor: FileItemPublic,
		target: FileItemPublic,
	): MockItemPublic[] {
		const visible = visibleItems.value;
		const containsBoth =
			visible.some((entry) => entry.id === anchor.id) &&
			visible.some((entry) => entry.id === target.id);
		if (containsBoth) return visible;
		if (anchor.ancestor === target.ancestor) {
			return itemsForFolder(target.ancestor);
		}
		return [];
	}

	function trySelectRange(
		anchor: FileItemPublic,
		target: FileItemPublic,
	): boolean {
		const reference = rangeReference(anchor, target);
		const anchorIndex = reference.findIndex((entry) => entry.id === anchor.id);
		const targetIndex = reference.findIndex((entry) => entry.id === target.id);
		if (anchorIndex === -1 || targetIndex === -1) return false;
		const from = Math.min(anchorIndex, targetIndex);
		const to = Math.max(anchorIndex, targetIndex);
		const rangeIds = reference
			.slice(from, to + 1)
			.filter(isPickerFile)
			.filter(matchesAcceptedTypes)
			.map((file) => file.id);
		selectedIds.value = [...new Set([...selectedIds.value, ...rangeIds])];
		return true;
	}

	function handleItemClick(item: MockItemPublic, event?: MouseEvent): void {
		if (!isPickerFile(item)) {
			openFolder(item.id);
			return;
		}
		if (isDisabled(item)) return;
		if (options.multiple && event?.shiftKey) {
			const anchor = focusedFile.value;
			if (anchor && trySelectRange(anchor, item)) return;
		}
		toggleSelection(item);
	}

	function confirmWith(ids: string[]): void {
		const files = ids
			.map((id) => store.map.value.files.get(id))
			.filter((file): file is FileItem => file !== undefined)
			.filter(matchesAcceptedTypes);
		if (files.length) options.onConfirm(files);
	}

	function confirmSelection(): void {
		confirmWith(selectedIds.value);
	}

	function handleItemOpen(item: MockItemPublic): void {
		if (!isPickerFile(item)) {
			openFolder(item.id);
			return;
		}
		if (isDisabled(item)) return;
		if (options.browse) {
			previewFile(item);
			return;
		}
		const ids = options.multiple
			? [...new Set([...selectedIds.value, item.id])]
			: [item.id];
		confirmWith(ids);
	}

	function cancel(): void {
		options.onCancel();
	}

	function resolveInitialLocation(): PickerLocation {
		const firstSelected = options.initialSelectedIds[0];
		const selectedFile = firstSelected
			? store.map.value.files.get(firstSelected)
			: undefined;
		if (selectedFile) return { kind: "folder", folderId: selectedFile.ancestor };
		const boundFolderId = options.initialBinding
			? store.getFolderIdByBinding(options.initialBinding)
			: undefined;
		return { kind: "folder", folderId: boundFolderId ?? null };
	}

	async function initialize(): Promise<void> {
		await store.handleLoad();
		navigation.reset(resolveInitialLocation());
	}

	function startRename(item: MockItemPublic): void {
		renamingId.value = item.id;
	}

	function cancelRename(): void {
		renamingId.value = null;
	}

	async function commitRename(item: MockItemPublic, name: string): Promise<void> {
		renamingId.value = null;
		const trimmed = name.trim();
		if (!trimmed || trimmed === item.name) return;
		item.name = trimmed;
		await store.handleUpdateItem(item);
	}

	async function deleteFile(file: FileItemPublic): Promise<void> {
		selectedIds.value = selectedIds.value.filter((id) => id !== file.id);
		if (focusedId.value === file.id) focusedId.value = null;
		if (lightboxFileId.value === file.id) lightboxFileId.value = null;
		await store.handleDeleteItem(file);
	}

	const deletingFile = computed(() =>
		deletingFileId.value
			? store.map.value.files.get(deletingFileId.value)
			: undefined,
	);

	function requestDeleteFile(file: FileItemPublic): void {
		deletingFileId.value = file.id;
	}

	async function resolveDeleteConfirm(confirmed: boolean): Promise<void> {
		const file = deletingFile.value;
		deletingFileId.value = null;
		if (confirmed && file) await deleteFile(file);
	}

	async function downloadFile(file: FileItemPublic): Promise<void> {
		const { url } = await api.fetchReadUrl(file.id);
		window.open(url, "_blank", "noopener");
	}

	async function createFolder(): Promise<void> {
		if (!isFolderLocation.value) return;
		const created = await store.handleAddFolder(location.value.folderId);
		if (created) renamingId.value = created.id;
	}

	async function uploadFiles(files: File[]): Promise<void> {
		if (!files.length || !isFolderLocation.value) return;
		await store.handleUploadFiles(files, location.value.folderId);
	}

	function pathLabel(item: MockItemPublic): string {
		const names = item.ancestors
			.map((id) => store.map.value.folders.get(id)?.name)
			.filter((name): name is string => Boolean(name));
		return [t("dms.finder.navigation.root"), ...names].join(" › ");
	}

	const locationSummary = computed(() => {
		const size = visibleItems.value.reduce(
			(total, item) => (isPickerFile(item) ? total + item.size : total),
			0,
		);
		return t("dms_media.picker.items_meta", {
			count: visibleItems.value.length,
			size: formatFileSize(size),
		});
	});

	function previewFile(file: FileItemPublic): void {
		focusedId.value = file.id;
		lightboxFileId.value = file.id;
	}

	const lightboxFile = computed(() =>
		lightboxFileId.value
			? store.map.value.files.get(lightboxFileId.value)
			: undefined,
	);

	function closeLightbox(): void {
		lightboxFileId.value = null;
	}

	function isImageFile(file: FileItemPublic): boolean {
		return file.mimetype.startsWith("image/");
	}

	function isEditableImage(file: FileItemPublic): boolean {
		return isEditableImageMimetype(file.mimetype);
	}

	const editingFile = computed(() =>
		editingFileId.value
			? store.map.value.files.get(editingFileId.value)
			: undefined,
	);

	function editFile(file: FileItemPublic): Promise<boolean> {
		editingFileId.value = file.id;
		return new Promise((resolve) => {
			editResolver = resolve;
		});
	}

	async function finishEdit(changed: boolean): Promise<void> {
		editingFileId.value = null;
		if (changed) await store.handleLoad();
		editResolver?.(changed);
		editResolver = null;
	}

	const movingItem = computed(() =>
		movingItemId.value
			? store.map.value.entries.get(movingItemId.value)
			: undefined,
	);

	function startMove(item: MockItemPublic): void {
		movingItemId.value = item.id;
	}

	function closeMove(): void {
		movingItemId.value = null;
	}

	function canMoveItemTo(
		item: MockItemPublic,
		targetFolderId: string | null,
	): boolean {
		if (isPickerFile(item)) {
			return Boolean(targetFolderId) && item.ancestor !== targetFolderId;
		}
		if (!targetFolderId) return item.ancestor !== null;
		if (item.id === targetFolderId || item.ancestor === targetFolderId) {
			return false;
		}
		const target = store.map.value.folders.get(targetFolderId);
		if (!target) return false;
		return !target.ancestors.includes(item.id);
	}

	async function moveItemTo(
		item: MockItemPublic,
		targetFolderId: string | null,
	): Promise<void> {
		if (!canMoveItemTo(item, targetFolderId)) return;
		await store.handleMoveItem(item.id, targetFolderId);
	}

	const draggingItem = computed(() =>
		draggingItemId.value
			? store.map.value.entries.get(draggingItemId.value)
			: undefined,
	);

	function canDropInto(targetFolderId: string | null): boolean {
		const item = draggingItem.value;
		if (!item) return false;
		return canMoveItemTo(item, targetFolderId);
	}

	function handleDragStart(event: DragEvent, item: MockItemPublic): void {
		if (renamingId.value === item.id) return;
		event.dataTransfer?.setData(PICKER_INTERNAL_DRAG_TYPE, item.id);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
		draggingItemId.value = item.id;
	}

	function handleDragEnd(): void {
		draggingItemId.value = null;
		dropTargetId.value = null;
	}

	function handleFolderDragOver(
		event: DragEvent,
		folderId: string | null,
	): void {
		if (!canDropInto(folderId)) return;
		event.preventDefault();
		event.stopPropagation();
		if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
		dropTargetId.value = folderId ?? PICKER_ROOT_TREE_VALUE;
	}

	function handleFolderDragLeave(folderId: string | null): void {
		const key = folderId ?? PICKER_ROOT_TREE_VALUE;
		if (dropTargetId.value === key) dropTargetId.value = null;
	}

	async function handleFolderDrop(
		event: DragEvent,
		folderId: string | null,
	): Promise<void> {
		const dragged = draggingItem.value;
		handleDragEnd();
		if (!dragged || !canMoveItemTo(dragged, folderId)) return;
		event.preventDefault();
		event.stopPropagation();
		await moveItemTo(dragged, folderId);
	}

	function buildFileMenu(file: FileItemPublic): ContextMenuItem[][] {
		const actions: ContextMenuItem[] = [
			{
				label: t("dms.finder.actions.open"),
				icon: "i-lucide-eye",
				onSelect: () => afterMenuCloses(() => previewFile(file)),
			},
		];
		if (isEditableImage(file)) {
			actions.push({
				label: t("dms.finder.actions.edit_image"),
				icon: "i-lucide-crop",
				onSelect: () => afterMenuCloses(() => editFile(file)),
			});
		}
		actions.push(
			{
				label: t("dms.finder.actions.rename"),
				icon: "i-lucide-pencil",
				onSelect: () => afterMenuCloses(() => startRename(file)),
			},
			{
				label: t("dms_media.picker.move"),
				icon: "i-lucide-folder-input",
				onSelect: () => afterMenuCloses(() => startMove(file)),
			},
			{
				label: t("dms.finder.actions.download"),
				icon: "i-lucide-download",
				onSelect: () => downloadFile(file),
			},
		);
		return [
			actions,
			[
				{
					label: t("dms.finder.actions.delete"),
					icon: "i-lucide-trash-2",
					color: "error",
					onSelect: () => afterMenuCloses(() => requestDeleteFile(file)),
				},
			],
		];
	}

	function buildFolderMenu(folder: FolderItemPublic): ContextMenuItem[][] {
		return [
			[
				{
					label: t("dms.finder.actions.open"),
					icon: "i-lucide-folder-open",
					onSelect: () => openFolder(folder.id),
				},
				{
					label: t("dms.finder.actions.rename"),
					icon: "i-lucide-pencil",
					onSelect: () => afterMenuCloses(() => startRename(folder)),
				},
				{
					label: t("dms_media.picker.move"),
					icon: "i-lucide-folder-input",
					onSelect: () => afterMenuCloses(() => startMove(folder)),
				},
			],
		];
	}

	function buildBackgroundMenu(): ContextMenuItem[][] {
		return [
			[
				{
					label: t("dms.finder.actions.new_folder"),
					icon: "i-lucide-folder-plus",
					disabled: !isFolderLocation.value,
					onSelect: () => afterMenuCloses(() => createFolder()),
				},
			],
		];
	}

	function buildItemMenu(item: MockItemPublic | null): ContextMenuItem[][] {
		if (!item) return buildBackgroundMenu();
		return isPickerFile(item) ? buildFileMenu(item) : buildFolderMenu(item);
	}

	const contextMenuItems = computed(() => buildItemMenu(contextTarget.value));

	function setContextTarget(item: MockItemPublic | null): void {
		contextTarget.value = item;
	}

	function buildFolderTreeChildren(folderId: string | null): TreeItem[] {
		return store.getSubfoldersFromFolderId(folderId).map((folder) => {
			const children = buildFolderTreeChildren(folder.id);
			return {
				label: folder.name,
				value: folder.id,
				icon: folder.icon,
				children: children.length ? children : undefined,
			};
		});
	}

	const treeItems = computed<TreeItem[]>(() => [
		{
			label: t("dms.finder.navigation.root"),
			value: PICKER_ROOT_TREE_VALUE,
			icon: "i-lucide-home",
			children: buildFolderTreeChildren(null),
		},
	]);

	return {
		browse: options.browse,
		multiple: options.multiple,
		restricted: options.mimetypes.length > 0,
		isLoading: store.isLoading,
		searchQuery,
		normalizedQuery,
		isSearching,
		groupFilter,
		sort,
		viewMode,
		effectiveViewMode,
		isColumnsAvailable,
		zoom,
		tileSize,
		renamingId,
		isPreviewOpen,
		location,
		isFolderLocation,
		canGoBack,
		canGoForward,
		goBack,
		goForward,
		currentFolder,
		currentPath,
		visibleItems,
		itemsForFolder,
		locationSummary,
		selectedIds,
		selectedFiles,
		selectionSize,
		focusedFile,
		treeItems,
		contextMenuItems,
		isSelected,
		isDisabled,
		toggleSelection,
		toggleSort,
		openFolder,
		showRecents,
		handleItemClick,
		handleItemOpen,
		confirmSelection,
		cancel,
		initialize,
		startRename,
		cancelRename,
		commitRename,
		deleteFile,
		deletingFile,
		requestDeleteFile,
		resolveDeleteConfirm,
		downloadFile,
		createFolder,
		uploadFiles,
		pathLabel,
		previewFile,
		buildItemMenu,
		setContextTarget,
		lightboxFile,
		closeLightbox,
		isImageFile,
		isEditableImage,
		editFile,
		editingFile,
		finishEdit,
		movingItem,
		startMove,
		closeMove,
		canMoveItemTo,
		moveItemTo,
		dropTargetId,
		draggingItem,
		handleDragStart,
		handleDragEnd,
		handleFolderDragOver,
		handleFolderDragLeave,
		handleFolderDrop,
	};
}

export type PickerExplorerContext = ReturnType<typeof createPickerExplorer>;

const PICKER_EXPLORER_KEY: InjectionKey<PickerExplorerContext> =
	Symbol("picker-explorer");

export function useProvidePickerExplorer(
	options: PickerExplorerOptions,
): PickerExplorerContext {
	const context = createPickerExplorer(options);
	provide(PICKER_EXPLORER_KEY, context);
	return context;
}

export function usePickerExplorer(): PickerExplorerContext {
	const context = inject(PICKER_EXPLORER_KEY, null);
	if (!context) throw new Error("Picker explorer context is missing");
	return context;
}
