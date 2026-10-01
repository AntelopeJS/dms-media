import type { Layout } from "../composables/finder/context/useFinderLayout";

export interface ViewProps {
  supportedLayouts: Layout[];
  defaultLayout: Layout;
}

export interface SidepanelProps {
  showSidebar: boolean;
  showDetails: boolean;
}

export interface FinderProps
  extends Partial<ViewProps>,
    Partial<SidepanelProps> {}

export type SortBy = "name" | "date" | "size" | "type";
export type FilterType = "all" | "images" | "documents" | "other";

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface FolderTreeItem {
  id: string;
  label: string;
  fileCount: number;
  children?: FolderTreeItem[];
  defaultExpanded?: boolean;
}

export interface ColumnItem {
  type: "file" | "folder";
  data: FileItem | Folder;
}

export type UploadStatus = "pending" | "uploading" | "completed" | "error";

export interface UploadTask {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  folderId: string | null;
}
