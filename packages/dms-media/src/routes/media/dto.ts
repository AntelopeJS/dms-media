import { parseFolderAcl } from "../../acl";
import type { MediaAsset, MediaFolder } from "../../db";
import type { AclEntry, AssetVisibility, FolderVisibility } from "../../types";
import type { FolderStats } from "../../library/folder-stats";
import {
  type AssetTypeGroup,
  resolveTypeGroup,
} from "../../library/type-groups";
import type { MediaRequestContext } from "./context";

export interface FolderRightsDto {
  read: boolean;
  write: boolean;
  manage: boolean;
}

export interface MediaFolderDto {
  id: string;
  name: string;
  parentId: string | null;
  shell: boolean;
  bound: boolean;
  binding: string | null;
  visibility: FolderVisibility;
  hasOwnAcl: boolean;
  createdAt: Date;
  updatedAt: Date;
  rights: FolderRightsDto;
  fileCount: number;
  size: number;
  starred: boolean;
}

export interface MediaAssetDto {
  id: string;
  folderId: string;
  name: string;
  mimetype: string;
  size: number;
  width?: number;
  height?: number;
  alt?: string;
  visibility: AssetVisibility;
  effectiveVisibility: FolderVisibility;
  url: string;
  hasOriginal: boolean;
  typeGroup: AssetTypeGroup;
  starred: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** What a folder DTO adds to the folder row: its counts and the caller's star. */
export interface FolderDtoExtras {
  stats?: FolderStats;
  starredIds?: Set<string>;
}

export function buildFolderDto(
  context: MediaRequestContext,
  folder: MediaFolder,
  extras: FolderDtoExtras = {},
): MediaFolderDto {
  const shell = context.access.shells.has(folder._id);
  return {
    id: folder._id,
    name: folder.name,
    parentId: folder.parentId ?? null,
    shell,
    bound: Boolean(folder.binding),
    binding: folder.binding ?? null,
    visibility: folder.visibility,
    hasOwnAcl: parseFolderAcl(folder) !== undefined,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    rights: {
      read: context.access.readable.has(folder._id),
      write: context.access.writable.has(folder._id),
      manage: context.access.manageable.has(folder._id),
    },
    fileCount: extras.stats?.fileCount ?? 0,
    size: extras.stats?.size ?? 0,
    starred: extras.starredIds?.has(folder._id) ?? false,
  };
}

export function isFolderVisible(
  context: MediaRequestContext,
  folder: MediaFolder,
): boolean {
  return (
    context.access.readable.has(folder._id) ||
    context.access.shells.has(folder._id)
  );
}

export function listVisibleFolders(
  context: MediaRequestContext,
  statsByFolder: Map<string, FolderStats> = new Map(),
  starredIds: Set<string> = new Set(),
): MediaFolderDto[] {
  return context.folders
    .filter((folder) => isFolderVisible(context, folder))
    .map((folder) =>
      buildFolderDto(context, folder, {
        stats: statsByFolder.get(folder._id),
        starredIds,
      }),
    );
}

export function resolveEffectiveVisibility(
  asset: MediaAsset,
  folder: MediaFolder | undefined,
): FolderVisibility {
  if (asset.visibility !== "inherit") return asset.visibility;
  return folder?.visibility ?? "private";
}

export function buildDeliveryPath(asset: MediaAsset): string {
  return `/media/${asset._id}/${encodeURIComponent(asset.name)}`;
}

export function buildAssetDto(
  context: MediaRequestContext,
  asset: MediaAsset,
  starredIds: Set<string> = new Set(),
): MediaAssetDto {
  const folder = context.foldersById.get(asset.folderId);
  return {
    id: asset._id,
    folderId: asset.folderId,
    name: asset.name,
    mimetype: asset.mimetype,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    alt: asset.alt,
    visibility: asset.visibility,
    effectiveVisibility: resolveEffectiveVisibility(asset, folder),
    url: buildDeliveryPath(asset),
    hasOriginal: Boolean(asset.originalKey),
    typeGroup: resolveTypeGroup(asset.mimetype),
    starred: starredIds.has(asset._id),
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

export function readFolderAclEntries(folder: MediaFolder): AclEntry[] | null {
  return parseFolderAcl(folder) ?? null;
}
