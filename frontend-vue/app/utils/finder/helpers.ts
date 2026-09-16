import { FileExplorerItemType, FileItem, type FileItemPublic } from "./models";
import { type TranslateFunction, formatRelativeDate } from "./formatter";
import { getExtensionLabel } from "./mime";

type TranslateFunctionSimple = (key: string) => string;

/* Item Helpers */
type FinderItem = FileItemPublic | FolderItemPublic;

interface ItemMaps {
  folders: Map<string, FolderItem>;
  files: Map<string, FileItem>;
  entries: Map<string, MockItem>;
}

export function buildItemMap(newRaw: MockItemSchema[]): ItemMaps {
  const _folders = new Map<string, FolderItem>();
  const _files = new Map<string, FileItem>();

  // Build items
  for (const raw of newRaw) {
    let item: MockItem | undefined;

    if ("childrenIds" in raw) {
      item = new FolderItem({
        id: raw.id,
        name: raw.name,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        icon: raw.icon,
        path: raw.path,
        childrenIds: raw.childrenIds,
      });
      _folders.set(item.id, item);
    } else {
      item = new FileItem({
        id: raw.id,
        name: raw.name,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        path: raw.path,
        mimetype: raw.mimetype,
        size: raw.size,
        preview: raw.preview,
      });
      _files.set(item.id, item);
    }
  }

  return {
    entries: new Map<string, MockItem>([
      ..._folders.entries(),
      ..._files.entries(),
    ]),
    folders: _folders,
    files: _files,
  };
}

export function getItemIcon(item: FinderItem | null): string {
  if (!item) return "i-ph-file-dashed";

  return item.type === FileExplorerItemType.File
    ? getExtensionIcon((item as FileItemPublic).mimetype)
    : item.icon || "i-lucide-folder";
}

export function getItemPreview(item: FinderItem | null): string | undefined {
  if (!item) return;
  return item.type === FileExplorerItemType.File
    ? (item as FileItemPublic).preview
    : undefined;
}

export function getItemFolderId(item: FinderItem): string | null {
  return item.type === FileExplorerItemType.Folder ? item.id : null;
}

export function getItemTypeLabel(
  item: FinderItem,
  t?: TranslateFunctionSimple,
): string {
  if (item.type === FileExplorerItemType.Folder) {
    return t ? t("dms.finder.details.folder_type") : "folder";
  }
  return getExtensionLabel(item.mimetype, t);
}

export function getItemSizeLabel(
  item: FinderItem,
  formatFileSize: (bytes: number) => string,
): string {
  return item.type === FileExplorerItemType.Folder
    ? "-"
    : formatFileSize((item as FileItemPublic).size);
}

export function getItemModifiedLabel(
  item: FinderItem,
  t: TranslateFunction,
): string {
  return item.type === FileExplorerItemType.Folder
    ? "-"
    : formatRelativeDate((item as FileItemPublic).updatedAt, t);
}
