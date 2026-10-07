import type {
  MeterSegment,
  MeterTone,
} from "@antelopejs/interface-dms/base/meter";
import type { KeyValueListItem } from "@antelopejs/interface-dms/base/key-value-list";
import type { NavCardItem } from "@antelopejs/interface-dms/base/nav-card-grid";
import type { StatGroupItem } from "@antelopejs/interface-dms/base/stat-group";
import type { MediaAsset, MediaFolder } from "../db";
import type { FolderStats } from "./folder-stats";
import type { MediaTranslator } from "./i18n";
import { folderLink, MEDIA_ROUTES, viewLink } from "./links";
import { sumSizeByTypeGroup, countByTypeGroup } from "./listing";
import {
  ASSET_TYPE_GROUPS,
  type AssetTypeGroup,
  isDescribableImage,
} from "./type-groups";
import type { FolderVisibility } from "../types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_DAYS = 30;
const PERCENT = 100;
const QUOTA_WARNING_PERCENT = 80;
const LARGEST_FOLDERS = 5;
const LARGE_FILE_BYTES = 20 * 1024 * 1024;
const TEXTS = "$dms_media.overview";

const TYPE_TONES: Record<AssetTypeGroup, MeterTone> = {
  image: "primary",
  video: "warning",
  pdf: "error",
  document: "neutral",
  spreadsheet: "success",
  vector: "info",
  audio: "secondary",
  archive: "soft",
  other: "neutral",
};

export interface OverviewInput {
  assets: MediaAsset[];
  folders: MediaFolder[];
  stats: Map<string, FolderStats>;
  translator: MediaTranslator;
  visibilityOf: (asset: MediaAsset) => FolderVisibility;
  quotaBytes?: number;
  now: Date;
}

function percentOf(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * PERCENT);
}

function totalSize(assets: MediaAsset[]): number {
  return assets.reduce((total, asset) => total + asset.size, 0);
}

function missingAlt(assets: MediaAsset[]): MediaAsset[] {
  return assets.filter(
    (asset) => isDescribableImage(asset.mimetype) && !asset.alt?.trim(),
  );
}

function storageItem(input: OverviewInput): StatGroupItem {
  const { translator, quotaBytes } = input;
  const size = totalSize(input.assets);
  const usedPercent = quotaBytes ? percentOf(size, quotaBytes) : undefined;
  return {
    id: "storage",
    icon: "i-ph-hard-drives",
    eyebrow: `${TEXTS}.kpis.storage`,
    value: translator.formatBytes(size),
    detail:
      usedPercent === undefined
        ? translator.t(`${TEXTS}.kpis.storage_detail`, {
            count: input.assets.length,
            files: translator.formatNumber(input.assets.length),
          })
        : translator.t(`${TEXTS}.kpis.storage_quota_detail`, {
            percent: usedPercent,
            quota: translator.formatBytes(quotaBytes ?? 0),
          }),
    detailTone:
      (usedPercent ?? 0) >= QUOTA_WARNING_PERCENT ? "warning" : "neutral",
  };
}

export function buildKpiItems(input: OverviewInput): StatGroupItem[] {
  const { assets, translator } = input;
  const since = input.now.getTime() - RECENT_WINDOW_DAYS * MS_PER_DAY;
  const uploaded = assets.filter((asset) => asset.createdAt.getTime() >= since);
  const publicCount = assets.filter(
    (asset) => input.visibilityOf(asset) === "public",
  ).length;
  const undescribed = missingAlt(assets);
  const publicUndescribed = undescribed.filter(
    (asset) => input.visibilityOf(asset) === "public",
  ).length;
  return [
    {
      id: "files",
      icon: "i-ph-files",
      eyebrow: `${TEXTS}.kpis.files`,
      value: assets.length,
      detail: translator.t(`${TEXTS}.kpis.files_detail`, {
        count: uploaded.length,
        files: translator.formatNumber(uploaded.length),
      }),
      detailTone: uploaded.length > 0 ? "success" : "neutral",
      to: MEDIA_ROUTES.files,
    },
    storageItem(input),
    {
      id: "public",
      icon: "i-ph-globe",
      eyebrow: `${TEXTS}.kpis.public`,
      value: publicCount,
      detail: translator.t(`${TEXTS}.kpis.public_detail`, {
        percent: percentOf(publicCount, assets.length),
      }),
    },
    {
      id: "missing-alt",
      icon: "i-ph-text-aa",
      tone: undescribed.length > 0 ? "warning" : "success",
      eyebrow: `${TEXTS}.kpis.missing_alt`,
      value: undescribed.length,
      detail: translator.t(`${TEXTS}.kpis.missing_alt_detail`, {
        count: publicUndescribed,
        files: translator.formatNumber(publicUndescribed),
      }),
      detailTone: publicUndescribed > 0 ? "warning" : "neutral",
      to: viewLink("missing-alt"),
    },
  ];
}

export interface StorageMeterResponse {
  value: number;
  max: number;
  valueLabel: string;
  hint: string;
  segments: MeterSegment[];
}

export function buildStorageMeter(input: OverviewInput): StorageMeterResponse {
  const { translator, assets } = input;
  const sizes = sumSizeByTypeGroup(assets);
  const counts = countByTypeGroup(assets);
  const size = totalSize(assets);
  const segments = ASSET_TYPE_GROUPS.filter((group) => counts[group] > 0).map(
    (group) => ({
      value: sizes[group],
      tone: TYPE_TONES[group],
      label: translator.t(`${TEXTS}.storage.segment`, {
        type: translator.t(`$dms_media.types.${group}`),
        files: translator.formatNumber(counts[group]),
        size: translator.formatBytes(sizes[group]),
      }),
    }),
  );
  return {
    value: size,
    max: Math.max(input.quotaBytes ?? size, 1),
    valueLabel: translator.formatBytes(size),
    hint: translator.t(`${TEXTS}.storage.hint`, {
      count: assets.length,
      files: translator.formatNumber(assets.length),
    }),
    segments,
  };
}

function folderPathLabel(
  folder: MediaFolder,
  foldersById: Map<string, MediaFolder>,
): string {
  return [...folder.path, folder._id]
    .map((id) => foldersById.get(id)?.name)
    .filter((name): name is string => Boolean(name))
    .join(" › ");
}

export function buildLargestFolders(input: OverviewInput): KeyValueListItem[] {
  const { translator } = input;
  const foldersById = new Map(
    input.folders.map((folder) => [folder._id, folder]),
  );
  const leafSized = input.folders
    .map((folder) => ({ folder, stats: input.stats.get(folder._id) }))
    .filter((entry) => (entry.stats?.directFileCount ?? 0) > 0)
    .sort((left, right) => (right.stats?.size ?? 0) - (left.stats?.size ?? 0))
    .slice(0, LARGEST_FOLDERS);
  return leafSized.map(({ folder, stats }) => ({
    id: folder._id,
    label: folderPathLabel(folder, foldersById),
    value: translator.formatBytes(stats?.size ?? 0),
    type: "mono",
    detail: translator.t(`${TEXTS}.largest.detail`, {
      count: stats?.fileCount ?? 0,
      files: translator.formatNumber(stats?.fileCount ?? 0),
    }),
    to: folderLink(folder._id),
  }));
}

export interface AttentionInput extends OverviewInput {
  failedUploads: number;
  restrictedFolders: MediaFolder[];
}

export function buildAttentionItems(input: AttentionInput): KeyValueListItem[] {
  const { translator, assets } = input;
  const undescribed = missingAlt(assets);
  const large = assets.filter((asset) => asset.size > LARGE_FILE_BYTES);
  const items: KeyValueListItem[] = [];
  if (undescribed.length > 0) {
    const publicCount = undescribed.filter(
      (asset) => input.visibilityOf(asset) === "public",
    ).length;
    items.push({
      id: "missing-alt",
      label: `${TEXTS}.attention.missing_alt`,
      value: translator.formatNumber(undescribed.length),
      type: "status",
      tone: "warning",
      detail: translator.t(`${TEXTS}.attention.missing_alt_detail`, {
        count: publicCount,
        files: translator.formatNumber(publicCount),
      }),
      to: viewLink("missing-alt"),
    });
  }
  if (input.failedUploads > 0) {
    items.push({
      id: "failed-uploads",
      label: `${TEXTS}.attention.failed_uploads`,
      value: translator.formatNumber(input.failedUploads),
      type: "status",
      tone: "error",
      detail: `${TEXTS}.attention.failed_uploads_detail`,
      to: MEDIA_ROUTES.uploads,
    });
  }
  if (large.length > 0) {
    items.push({
      id: "large-files",
      label: `${TEXTS}.attention.large_files`,
      value: translator.formatNumber(large.length),
      type: "status",
      tone: "neutral",
      detail: translator.t(`${TEXTS}.attention.large_files_detail`, {
        size: translator.formatBytes(totalSize(large)),
      }),
      to: `${MEDIA_ROUTES.files}?view=recent&sort=size&direction=desc`,
    });
  }
  for (const folder of input.restrictedFolders) {
    items.push({
      id: `restricted-${folder._id}`,
      label: translator.t(`${TEXTS}.attention.own_rules`, {
        name: folder.name,
      }),
      value: translator.t(`${TEXTS}.attention.own_rules_value`),
      type: "status",
      tone: "info",
      detail: `${TEXTS}.attention.own_rules_detail`,
      to: `${MEDIA_ROUTES.access}?folder=${encodeURIComponent(folder._id)}`,
    });
  }
  return items;
}

export function buildFolderCards(input: OverviewInput): NavCardItem[] {
  const { translator } = input;
  return input.folders
    .filter((folder) => !folder.parentId)
    .map((folder) => {
      const stats = input.stats.get(folder._id);
      return {
        id: folder._id,
        title: folder.name,
        icon: folder.binding ? "i-ph-link-simple" : "i-ph-folder-simple",
        iconTone: folder.visibility === "public" ? "success" : "primary",
        to: folderLink(folder._id),
        description: translator.t(`${TEXTS}.folders.detail`, {
          count: stats?.fileCount ?? 0,
          files: translator.formatNumber(stats?.fileCount ?? 0),
          size: translator.formatBytes(stats?.size ?? 0),
        }),
        tag:
          folder.visibility === "public"
            ? translator.t("$dms_media.visibility.public")
            : undefined,
      };
    });
}

export function recentAssets(
  assets: MediaAsset[],
  limit: number,
): MediaAsset[] {
  return [...assets]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, limit);
}
