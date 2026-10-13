import type {
  MeterSegment,
  MeterTone,
} from "@antelopejs/interface-dms/base/meter";
import type { KeyValueListItem } from "@antelopejs/interface-dms/base/key-value-list";
import type { StatGroupItem } from "@antelopejs/interface-dms/base/stat-group";
import type { MediaAsset } from "../db";
import type { BlockText } from "@antelopejs/interface-dms/base/types";
import { composedBytes, composedText, countParam } from "./composed-text";
import { MEDIA_ROUTES, viewLink } from "./links";
import {
  ASSET_TYPE_GROUPS,
  type AssetTypeGroup,
  isDescribableImage,
  resolveTypeGroup,
} from "./type-groups";
import type { FolderVisibility } from "../types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_DAYS = 30;
const PERCENT = 100;
const QUOTA_WARNING_PERCENT = 80;
const BYTES_PER_MEGABYTE = 1000 * 1000;
const LARGE_FILE_MEGABYTES = 20;
const LARGE_FILE_BYTES = LARGE_FILE_MEGABYTES * BYTES_PER_MEGABYTE;
const TEXTS = "$dms_media.overview";

/**
 * One hue per kind of file, never an alarm colour: images cyan, vectors and
 * videos violet, spreadsheets and audio green, PDFs and documents amber. The
 * meter offers four such hues; kinds that share one are close relatives.
 */
const TYPE_TONES: Record<AssetTypeGroup, MeterTone> = {
  image: "primary",
  vector: "secondary",
  video: "secondary",
  spreadsheet: "success",
  audio: "success",
  pdf: "warning",
  document: "warning",
  archive: "neutral",
  other: "neutral",
};

export interface OverviewInput {
  assets: MediaAsset[];
  visibilityOf: (asset: MediaAsset) => FolderVisibility;
  quotaBytes?: number;
  now: Date;
}

function percentOf(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * PERCENT);
}

/** Bytes an asset keeps in storage: its current file and, once edited, its original. */
export function storedSize(asset: MediaAsset): number {
  return asset.size + (asset.originalSize ?? 0);
}

function totalSize(assets: MediaAsset[]): number {
  return assets.reduce((total, asset) => total + storedSize(asset), 0);
}

function missingAlt(assets: MediaAsset[]): MediaAsset[] {
  return assets.filter(
    (asset) => isDescribableImage(asset.mimetype) && !asset.alt?.trim(),
  );
}

function countPublic(input: OverviewInput, assets: MediaAsset[]): number {
  return assets.filter((asset) => input.visibilityOf(asset) === "public")
    .length;
}

function storageItem(input: OverviewInput): StatGroupItem {
  const { quotaBytes } = input;
  const size = totalSize(input.assets);
  const usedPercent = quotaBytes ? percentOf(size, quotaBytes) : undefined;
  return {
    id: "storage",
    icon: "i-ph-hard-drives",
    eyebrow: `${TEXTS}.kpis.storage`,
    value: composedBytes(size),
    detail:
      usedPercent === undefined
        ? composedText(`${TEXTS}.kpis.storage_detail`, {
            files: countParam(input.assets.length),
          })
        : composedText(`${TEXTS}.kpis.storage_quota_detail`, {
            percent: usedPercent,
            quota: composedBytes(quotaBytes ?? 0),
          }),
    detailTone:
      (usedPercent ?? 0) >= QUOTA_WARNING_PERCENT ? "warning" : "neutral",
    to: viewLink("largest"),
  };
}

function missingAltItem(input: OverviewInput): StatGroupItem {
  const undescribed = missingAlt(input.assets);
  const publicUndescribed = countPublic(input, undescribed);
  return {
    id: "missing-alt",
    icon: "i-ph-text-aa",
    tone: undescribed.length > 0 ? "warning" : "success",
    eyebrow: `${TEXTS}.kpis.missing_alt`,
    value: undescribed.length,
    detail:
      undescribed.length === 0
        ? `${TEXTS}.kpis.missing_alt_none`
        : composedText(`${TEXTS}.kpis.missing_alt_public`, {
            files: countParam(publicUndescribed),
          }),
    detailTone: publicUndescribed > 0 ? "warning" : "neutral",
    to: viewLink("missing-alt"),
  };
}

export function buildKpiItems(input: OverviewInput): StatGroupItem[] {
  const { assets } = input;
  const since = input.now.getTime() - RECENT_WINDOW_DAYS * MS_PER_DAY;
  const uploaded = assets.filter((asset) => asset.createdAt.getTime() >= since);
  const publicCount = countPublic(input, assets);
  return [
    {
      id: "files",
      icon: "i-ph-files",
      eyebrow: `${TEXTS}.kpis.files`,
      value: assets.length,
      detail: composedText(`${TEXTS}.kpis.files_detail`, {
        files: countParam(uploaded.length),
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
      detail: composedText(`${TEXTS}.kpis.public_share`, {
        percent: percentOf(publicCount, assets.length),
      }),
      to: viewLink("public"),
    },
    missingAltItem(input),
  ];
}

export interface StorageMeterResponse {
  value: number;
  max: number;
  valueLabel: BlockText;
  hint: BlockText;
  segments: MeterSegment[];
}

interface TypeGroupTotal {
  files: number;
  size: number;
}

function totalsByTypeGroup(
  assets: MediaAsset[],
): Map<AssetTypeGroup, TypeGroupTotal> {
  const totals = new Map<AssetTypeGroup, TypeGroupTotal>();
  for (const asset of assets) {
    const group = resolveTypeGroup(asset.mimetype);
    const total = totals.get(group) ?? { files: 0, size: 0 };
    totals.set(group, {
      files: total.files + 1,
      size: total.size + storedSize(asset),
    });
  }
  return totals;
}

export function buildStorageMeter(input: OverviewInput): StorageMeterResponse {
  const { assets } = input;
  const totals = totalsByTypeGroup(assets);
  const size = totalSize(assets);
  const segments = ASSET_TYPE_GROUPS.flatMap((group) => {
    const total = totals.get(group);
    if (!total) return [];
    return [
      {
        value: total.size,
        tone: TYPE_TONES[group],
        label: composedText(`${TEXTS}.storage.type_segment`, {
          type: composedText(`$dms_media.types.${group}`),
          files: countParam(total.files),
          size: composedBytes(total.size),
        }),
      },
    ];
  });
  return {
    value: size,
    max: Math.max(input.quotaBytes ?? size, 1),
    valueLabel: composedBytes(size),
    hint: composedText(`${TEXTS}.storage.hint`, {
      files: countParam(assets.length),
    }),
    segments,
  };
}

export interface AttentionInput extends OverviewInput {
  failedUploads: number;
}

function failedUploadsItem(failedUploads: number): KeyValueListItem {
  return {
    id: "failed-uploads",
    label: composedText(`${TEXTS}.attention.failed_uploads_action`, {
      files: countParam(failedUploads),
    }),
    value: failedUploads,
    type: "status",
    tone: "error",
    detail: `${TEXTS}.attention.failed_uploads_hint`,
    to: `${MEDIA_ROUTES.uploads}?tab=failed`,
  };
}

function missingAltAttention(
  input: OverviewInput,
  undescribed: MediaAsset[],
): KeyValueListItem {
  return {
    id: "missing-alt",
    label: composedText(`${TEXTS}.attention.missing_alt_action`, {
      files: countParam(undescribed.length),
    }),
    value: undescribed.length,
    type: "status",
    tone: "warning",
    detail: composedText(`${TEXTS}.attention.missing_alt_detail`, {
      files: countParam(countPublic(input, undescribed)),
    }),
    to: viewLink("missing-alt"),
  };
}

function largeFilesItem(large: MediaAsset[]): KeyValueListItem {
  return {
    id: "large-files",
    label: composedText(`${TEXTS}.attention.large_files_action`, {
      files: countParam(large.length),
      threshold: composedBytes(LARGE_FILE_BYTES),
    }),
    value: large.length,
    type: "status",
    tone: "neutral",
    detail: composedText(`${TEXTS}.attention.large_files_detail`, {
      size: composedBytes(totalSize(large)),
    }),
    to: viewLink("largest"),
  };
}

/** What the owner should act on first: failed uploads, missing alt texts, heavy files. */
export function buildAttentionItems(input: AttentionInput): KeyValueListItem[] {
  const undescribed = missingAlt(input.assets);
  const large = input.assets.filter((asset) => asset.size > LARGE_FILE_BYTES);
  return [
    input.failedUploads > 0 ? failedUploadsItem(input.failedUploads) : null,
    undescribed.length > 0 ? missingAltAttention(input, undescribed) : null,
    large.length > 0 ? largeFilesItem(large) : null,
  ].filter((item): item is KeyValueListItem => item !== null);
}

export function recentAssets(
  assets: MediaAsset[],
  limit: number,
): MediaAsset[] {
  return [...assets]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, limit);
}
