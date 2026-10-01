import type {
	FileItemPublic,
	FolderItemPublic,
} from "../../../utils/finder/models";

type FinderItem = FileItemPublic | FolderItemPublic;

export function useFinderSelectionClick() {
	const hooks = useFinderHooks();
	const { anchorItem } = useFinderSelect();
	const { getSubfoldersFromFolderId, getFilesFromFolderId } = useFinderStore();

	function orderedSiblings(item: FinderItem): FinderItem[] {
		const parentId = item.ancestor ?? null;
		return [
			...getSubfoldersFromFolderId(parentId),
			...getFilesFromFolderId(parentId),
		];
	}

	function selectRange(item: FinderItem): void {
		const anchor = anchorItem.value;
		const siblings = orderedSiblings(item);
		const anchorIndex = anchor
			? siblings.findIndex((sibling) => sibling.id === anchor.id)
			: -1;
		const itemIndex = siblings.findIndex((sibling) => sibling.id === item.id);
		if (anchorIndex < 0 || itemIndex < 0) {
			anchorItem.value = item;
			hooks.callHook("select:item:all", [item]);
			return;
		}
		const from = Math.min(anchorIndex, itemIndex);
		const to = Math.max(anchorIndex, itemIndex);
		hooks.callHook("select:item:all", siblings.slice(from, to + 1));
	}

	function handleModifiedClick(event: MouseEvent, item: FinderItem): boolean {
		if (event.shiftKey) {
			selectRange(item);
			return true;
		}
		if (event.ctrlKey || event.metaKey) {
			hooks.callHook("select:item:toggle", item);
			anchorItem.value = item;
			return true;
		}
		anchorItem.value = item;
		return false;
	}

	return { handleModifiedClick };
}
