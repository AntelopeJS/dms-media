import type {
	FileItem,
	FileItemPublic,
	FileItemSchema,
	FolderItem,
	FolderItemPublic,
	FolderItemSchema,
	MockItemPublic,
	MockItemSchema,
} from "../../../utils/finder/models";
import type { MediaAssetDto, MediaFolderDto } from "../api/useMediaApi";

export type MockItem = FolderItem | FileItem;

const RAW_STATE_KEY = "dms-media-finder-raw";
const LOADING_STATE_KEY = "dms-media-finder-loading";
const BINDINGS_STATE_KEY = "dms-media-finder-bindings";
const SHELL_ICON = "i-lucide-folder-lock";
const NEW_FOLDER_MAX_ATTEMPTS = 100;

function folderPathsById(folders: MediaFolderDto[]): Map<string, string[]> {
	const byId = new Map(folders.map((folder) => [folder.id, folder]));
	const paths = new Map<string, string[]>();
	const resolvePath = (id: string, guard: Set<string>): string[] => {
		const cached = paths.get(id);
		if (cached) return cached;
		const folder = byId.get(id);
		if (!folder || guard.has(id)) return [];
		guard.add(id);
		const path = folder.parentId
			? [...resolvePath(folder.parentId, guard), folder.parentId]
			: [];
		paths.set(id, path);
		return path;
	};
	for (const folder of folders) resolvePath(folder.id, new Set());
	return paths;
}

function buildRawItems(
	folders: MediaFolderDto[],
	assets: MediaAssetDto[],
): MockItemSchema[] {
	const paths = folderPathsById(folders);
	const childrenByFolder = new Map<string, string[]>();
	const pushChild = (parentId: string | null, id: string) => {
		if (!parentId) return;
		const children = childrenByFolder.get(parentId) ?? [];
		children.push(id);
		childrenByFolder.set(parentId, children);
	};
	for (const folder of folders) pushChild(folder.parentId, folder.id);
	for (const asset of assets) pushChild(asset.folderId, asset.id);

	const folderSchemas: FolderItemSchema[] = folders.map((folder) => ({
		id: folder.id,
		name: folder.name,
		createdAt: new Date(folder.createdAt),
		updatedAt: new Date(folder.updatedAt),
		icon: folder.shell ? SHELL_ICON : undefined,
		path: paths.get(folder.id) ?? [],
		childrenIds: childrenByFolder.get(folder.id) ?? [],
	}));

	const fileSchemas: FileItemSchema[] = assets.map((asset) => ({
		id: asset.id,
		name: asset.name,
		createdAt: new Date(asset.createdAt),
		updatedAt: new Date(asset.updatedAt),
		path: [...(paths.get(asset.folderId) ?? []), asset.folderId],
		mimetype: asset.mimetype,
		size: asset.size,
		preview: undefined,
	}));

	return [...folderSchemas, ...fileSchemas];
}

function isFileItem(item: MockItemPublic): boolean {
	return "mimetype" in item;
}

const PREVIEW_BATCH_SIZE = 200;

export const useFinderStore = () => {
	const { t } = useI18n();
	const api = useMediaApi();
	const toast = useToast();

	function notifyError(error: unknown): void {
		console.error("[FINDER] STORE", error);
		toast.add({
			title: t("dms_media.errors.action_failed"),
			color: "error",
			icon: "i-lucide-triangle-alert",
		});
	}

	const _raw = useDmsState<MockItemSchema[]>(RAW_STATE_KEY, () => []);
	const isLoading = useDmsState<boolean>(LOADING_STATE_KEY, () => false);
	const bindingIndex = useDmsState<Record<string, string>>(
		BINDINGS_STATE_KEY,
		() => ({}),
	);
	const map = computed(() => buildItemMap(_raw.value));

	const items = computed(() => ({
		entries: Array.from(map.value.entries.values()),
		files: Array.from(map.value.files.values()),
		folders: Array.from(map.value.folders.values()),
	}));

	const root = computed(() => ({
		entries: items.value.entries.filter((f) => !f.ancestors.length),
		files: items.value.files.filter((f) => !f.ancestors.length),
		folders: items.value.folders.filter((f) => !f.ancestors.length),
	}));

	function getSubfoldersFromFolderId(
		folderId?: string | null,
	): FolderItemPublic[] {
		if (!folderId) return root.value.folders;
		const result = map.value.folders.get(folderId);
		if (!result) return root.value.folders;
		return result.childrenIds
			.map((child) => map.value.folders.get(child))
			.filter((f): f is FolderItem => f !== undefined);
	}

	function getFilesFromFolderId(folderId?: string | null): FileItemPublic[] {
		if (!folderId) return root.value.files;
		const folder = map.value.folders.get(folderId);
		if (!folder) return root.value.files;
		return folder.childrenIds
			.map((child) => map.value.files.get(child))
			.filter((f): f is FileItem => f !== undefined);
	}

	function getFolderIdByBinding(binding: string): string | undefined {
		return bindingIndex.value[binding];
	}

	async function hydratePreviews(assets: MediaAssetDto[]): Promise<void> {
		const imageIds = assets
			.filter((asset) => asset.mimetype.startsWith("image/"))
			.map((asset) => asset.id);
		if (imageIds.length === 0) return;
		const previews: Record<string, string> = {};
		for (let start = 0; start < imageIds.length; start += PREVIEW_BATCH_SIZE) {
			const batch = imageIds.slice(start, start + PREVIEW_BATCH_SIZE);
			const response = await api.fetchPreviews(batch);
			Object.assign(previews, response.previews);
		}
		_raw.value = _raw.value.map((item) =>
			"mimetype" in item && previews[item.id]
				? { ...item, preview: previews[item.id] }
				: item,
		);
	}

	async function handleLoad(): Promise<void> {
		try {
			isLoading.value = true;
			const [tree, listing] = await Promise.all([
				api.fetchTree(),
				api.fetchAllAssets(),
			]);
			_raw.value = buildRawItems(tree.folders, listing.assets);
			bindingIndex.value = Object.fromEntries(
				tree.folders
					.filter((folder) => folder.binding)
					.map((folder) => [folder.binding as string, folder.id]),
			);
			if (listing.truncated) {
				toast.add({
					title: t("dms_media.errors.listing_truncated", {
						count: listing.assets.length,
					}),
					color: "warning",
					icon: "i-lucide-triangle-alert",
				});
			}
			await hydratePreviews(listing.assets);
		} catch (error) {
			console.error("[FINDER] STORE - handleLoad", error);
		} finally {
			isLoading.value = false;
		}
	}

	async function handleUpdateItem(item: MockItemPublic): Promise<void> {
		try {
			isLoading.value = true;
			if (isFileItem(item)) {
				await api.updateAsset(item.id, { name: item.name });
			} else {
				await api.renameFolder(item.id, item.name);
			}
			await handleLoad();
		} catch (error) {
			notifyError(error);
			await handleLoad();
		} finally {
			isLoading.value = false;
		}
	}

	async function handleDeleteItem(item: MockItemPublic): Promise<void> {
		try {
			isLoading.value = true;
			if (isFileItem(item)) {
				await api.deleteAsset(item.id);
			} else {
				await api.deleteFolder(item.id);
			}
			await handleLoad();
		} catch (error) {
			notifyError(error);
		} finally {
			isLoading.value = false;
		}
	}

	async function handleShare(file: FileItemPublic): Promise<void> {
		if (!navigator.share) {
			console.warn(
				"[FINDER] STORE - handleShare : Web Share API not supported",
			);
			return;
		}
		try {
			await navigator.share({
				title: file.name,
				text: t("dms.finder.share.text", { name: file.name }),
				url: file.preview ?? window.location.href,
			});
		} catch (error) {
			if ((error as Error).name !== "AbortError") {
				console.error("[FINDER] STORE - handleShare", error);
			}
		}
	}

	async function handleMoveItem(
		itemId: string,
		targetFolderId: string | null,
	): Promise<void> {
		const item = map.value.entries.get(itemId);
		if (!item) return;
		const isFile = "mimetype" in item;
		if (isFile && !targetFolderId) {
			console.warn("[FINDER] STORE - assets cannot live at the root");
			return;
		}
		try {
			isLoading.value = true;
			if (isFile) {
				await api.moveAsset(itemId, targetFolderId as string);
			} else {
				await api.moveFolder(itemId, targetFolderId);
			}
			await handleLoad();
		} catch (error) {
			notifyError(error);
		} finally {
			isLoading.value = false;
		}
	}

	function nextAvailableFolderName(parentId: string | undefined): string {
		const baseName = t("dms.finder.new_folder.default_name");
		const siblings = new Set(
			items.value.folders
				.filter((folder) => (folder.ancestor ?? undefined) === parentId)
				.map((folder) => folder.name),
		);
		if (!siblings.has(baseName)) return baseName;
		for (let index = 2; index < NEW_FOLDER_MAX_ATTEMPTS; index++) {
			const candidate = `${baseName} ${index}`;
			if (!siblings.has(candidate)) return candidate;
		}
		return `${baseName} ${Date.now()}`;
	}

	async function handleAddFolder(
		parentId: string | null,
	): Promise<FolderItem | undefined> {
		try {
			isLoading.value = true;
			const parent = parentId ?? undefined;
			const name = nextAvailableFolderName(parent);
			const created = await api.createFolder(name, parent);
			await handleLoad();
			return map.value.folders.get(created.id);
		} catch (error) {
			notifyError(error);
			return undefined;
		} finally {
			isLoading.value = false;
		}
	}

	async function handleUploadFiles(
		files: File[],
		folderId: string | null,
	): Promise<void> {
		if (!folderId) {
			toast.add({
				title: t("dms_media.errors.upload_needs_folder"),
				color: "warning",
				icon: "i-lucide-folder-x",
			});
			return;
		}
		try {
			isLoading.value = true;
			for (const file of files) {
				const presign = await api.presignUpload(folderId, file);
				const putResponse = await fetch(presign.uploadUrl, {
					method: "PUT",
					headers: presign.headers,
					body: file,
				});
				if (!putResponse.ok) {
					throw new Error(`Upload failed for ${file.name}`);
				}
				await api.confirmUpload(folderId, presign.resourceKey, file.name);
			}
			await handleLoad();
		} catch (error) {
			notifyError(error);
		} finally {
			isLoading.value = false;
		}
	}

	return {
		map,
		isLoading,
		root,
		items,

		getFilesFromFolderId,
		getSubfoldersFromFolderId,
		getFolderIdByBinding,
		handleAddFolder,
		handleDeleteItem,
		handleMoveItem,
		handleUpdateItem,
		handleUploadFiles,
		handleLoad,
		handleShare,
	};
};
