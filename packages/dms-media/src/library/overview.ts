import type {
  MeterSegment,
  MeterTone,
} from "@antelopejs/interface-dms/base/meter";
import type { KeyValueListItem } from "@antelopejs/interface-dms/base/key-value-list";
import type { StatGroupItem } from "@antelopejs/interface-dms/base/stat-group";
import {
  LARGE_FILE_BYTES,
  type LibraryTotals,
  type TypeGroupTotal,
} from "./asset-totals";
import type { BlockText } from "@antelopejs/interface-dms/base/types";
import { composedBytes, composedText, countParam } from "./composed-text";
import { MEDIA_ROUTES, viewLink } from "./links";
import { ASSET_TYPE_GROUPS, type AssetTypeGroup } from "./type-groups";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_DAYS = 30;
const PERCENT = 100;
const QUOTA_WARNING_PERCENT = 80;
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
  /** The library's figures, `createdSince` counted from {@link recentUploadsSince}. */
  totals: LibraryTotals;
  byTypeGroup: Map<AssetTypeGroup, TypeGroupTotal>;
  quotaBytes?: number;
}

/** Where the "uploaded lately" figure of the overview starts. */
export function recentUploadsSince(now: Date): Date {
  return new Date(now.getTime() - RECENT_WINDOW_DAYS * MS_PER_DAY);
}

function percentOf(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * PERCENT);
}

function storageItem(input: OverviewInput): StatGroupItem {
  const { quotaBytes, totals } = input;
  const size = totals.storedSize;
  const usedPercent = quotaBytes ? percentOf(size, quotaBytes) : undefined;
  return {
    id: "storage",
    icon: "i-ph-hard-drives",
    eyebrow: `${TEXTS}.kpis.storage`,
    value: composedBytes(size),
    detail:
      usedPercent === undefined
        ? composedText(`${TEXTS}.kpis.storage_detail`, {
            files: countParam(totals.files),
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

function missingAltItem({ totals }: OverviewInput): StatGroupItem {
  const undescribed = totals.missingAlt;
  const publicUndescribed = totals.publicMissingAlt;
  return {
    id: "missing-alt",
    icon: "i-ph-text-aa",
    tone: undescribed > 0 ? "warning" : "success",
    eyebrow: `${TEXTS}.kpis.missing_alt`,
    value: undescribed,
    detail:
      undescribed === 0
        ? `${TEXTS}.kpis.missing_alt_none`
        : composedText(`${TEXTS}.kpis.missing_alt_public`, {
            files: countParam(publicUndescribed),
          }),
    detailTone: publicUndescribed > 0 ? "warning" : "neutral",
    to: viewLink("missing-alt"),
  };
}

export function buildKpiItems(input: OverviewInput): StatGroupItem[] {
  const { totals } = input;
  const uploaded = totals.createdSince;
  const publicCount = totals.publicFiles;
  return [
    {
      id: "files",
      icon: "i-ph-files",
      eyebrow: `${TEXTS}.kpis.files`,
      value: totals.files,
      detail: composedText(`${TEXTS}.kpis.files_detail`, {
        files: countParam(uploaded),
      }),
      detailTone: uploaded > 0 ? "success" : "neutral",
      to: MEDIA_ROUTES.files,
    },
    storageItem(input),
    {
      id: "public",
      icon: "i-ph-globe",
      eyebrow: `${TEXTS}.kpis.public`,
      value: publicCount,
      detail: composedText(`${TEXTS}.kpis.public_share`, {
        percent: percentOf(publicCount, totals.files),
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

export function buildStorageMeter(input: OverviewInput): StorageMeterResponse {
  const size = input.totals.storedSize;
  const segments = ASSET_TYPE_GROUPS.flatMap((group) => {
    const total = input.byTypeGroup.get(group);
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
      files: countParam(input.totals.files),
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

function missingAltAttention(totals: LibraryTotals): KeyValueListItem {
  return {
    id: "missing-alt",
    label: composedText(`${TEXTS}.attention.missing_alt_action`, {
      files: countParam(totals.missingAlt),
    }),
    value: totals.missingAlt,
    type: "status",
    tone: "warning",
    detail: composedText(`${TEXTS}.attention.missing_alt_detail`, {
      files: countParam(totals.publicMissingAlt),
    }),
    to: viewLink("missing-alt"),
  };
}

function largeFilesItem(totals: LibraryTotals): KeyValueListItem {
  return {
    id: "large-files",
    label: composedText(`${TEXTS}.attention.large_files_action`, {
      files: countParam(totals.largeFiles),
      threshold: composedBytes(LARGE_FILE_BYTES),
    }),
    value: totals.largeFiles,
    type: "status",
    tone: "neutral",
    detail: composedText(`${TEXTS}.attention.large_files_detail`, {
      size: composedBytes(totals.largeStoredSize),
    }),
    to: viewLink("largest"),
  };
}

/** What the owner should act on first: failed uploads, missing alt texts, heavy files. */
export function buildAttentionItems(input: AttentionInput): KeyValueListItem[] {
  const { totals } = input;
  return [
    input.failedUploads > 0 ? failedUploadsItem(input.failedUploads) : null,
    totals.missingAlt > 0 ? missingAltAttention(totals) : null,
    totals.largeFiles > 0 ? largeFilesItem(totals) : null,
  ].filter((item): item is KeyValueListItem => item !== null);
}
