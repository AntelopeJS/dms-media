import z from "zod";

/* Schema */
// Global
export enum FileExplorerItemType {
  File = "file",
  Folder = "folder",
}

// File Explorer Item
const _zFileExplorerItem = z.object({
  id: z.string(),
  name: z.string(),

  createdAt: z.date(),
  updatedAt: z.date(),

  icon: z.string().optional(),
  path: z.array(z.string()),
});

type FileExplorerItemSchema = z.infer<typeof _zFileExplorerItem>;

// Folder Item
const _zFolderItem = _zFileExplorerItem.extend({
  childrenIds: z.array(z.string()),
});

export type FolderItemSchema = z.infer<typeof _zFolderItem>;

const _zFileItem = _zFileExplorerItem.extend({
  mimetype: z.string(),
  size: z.number(),

  preview: z.string().optional(),
});

export type FileItemSchema = z.infer<typeof _zFileItem>;

/* Models */
// File Explorer Item
export abstract class FileExplorerItem {
  public readonly id: string;

  public name: string;
  public createdAt: Date;
  public updatedAt: Date;

  abstract readonly type: FileExplorerItemType;

  private _path: string[];
  protected _icon?: string;

  constructor(data: FileExplorerItemSchema) {
    this.id = data.id;
    this.name = data.name;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this._icon = data.icon;
    this._path = data.path;
  }

  // Getters
  abstract icon: string;

  public get ancestor(): string | null {
    return this._path.at(-1) ?? null;
  }

  public get ancestors(): string[] {
    return this._path;
  }

  public get path(): string[] {
    return [...this._path, this.id];
  }

  public set path(path: string[]) {
    this._path = path;
  }

  protected get baseSchema(): FileExplorerItemSchema {
    return {
      id: this.id,
      name: this.name,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      icon: this._icon,
      path: this._path,
    };
  }

  abstract toSchema(): FolderItemSchema | FileItemSchema;
}

// Folder Item
export class FolderItem extends FileExplorerItem {
  public readonly type = FileExplorerItemType.Folder;

  public childrenIds: string[];

  constructor(data: FolderItemSchema) {
    super(data);
    this.childrenIds = data.childrenIds;
  }

  public get icon(): string {
    return this._icon || "i-lucide-folder";
  }

  public toSchema(): FolderItemSchema {
    return { ...this.baseSchema, childrenIds: this.childrenIds };
  }
}

// File Item
export class FileItem extends FileExplorerItem {
  public readonly type = FileExplorerItemType.File;

  public readonly mimetype: string;
  public size: number;

  public preview?: string;

  constructor(data: FileItemSchema) {
    super(data);
    this.mimetype = data.mimetype;
    this.size = data.size;
    this.preview = data.preview;
  }

  public get icon(): string {
    return this._icon || "i-lucide-file";
  }

  public toSchema(): FileItemSchema {
    return {
      ...this.baseSchema,
      mimetype: this.mimetype,
      size: this.size,
      preview: this.preview,
    };
  }
}

/* Public Types */
type Public<T> = Pick<T, keyof T>;

export type FileExplorerItemPublic = Public<FileExplorerItem>;
export type FolderItemPublic = Public<FolderItem>;
export type FileItemPublic = Public<FileItem>;
export type MockItemPublic = FolderItemPublic | FileItemPublic;
export type MockItemSchema = FolderItemSchema | FileItemSchema;
