import type { KeyValueListItem } from "@antelopejs/interface-dms/base/key-value-list";
import type { ComposedTextDateFormat } from "@antelopejs/interface-dms/base/types";
import type { SweepReport } from "../crons";
import { ValueProxy } from "@antelopejs/interface-database";
import { type MediaAsset, MediaAssetModel } from "../db";
import { DEFAULT_PRESETS, type MediaPresetConfig } from "../presets";
import { composedText, countParam } from "./composed-text";

const TEXTS = "$dms_media.presets.cache";
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const CRON_MINUTE_INDEX = 0;
const CRON_HOUR_INDEX = 1;
const DATE_FORMAT: ComposedTextDateFormat = "day";

export interface PresetCacheFacts {
  publicLinkSeconds: number;
  privateLinkSeconds: number;
  sweepSchedule: string;
  lastSweep?: SweepReport;
  now: Date;
}

/** A lifetime in whole hours when it is one ("1 h"), else in minutes ("5 min"). */
function duration(seconds: number) {
  if (seconds >= SECONDS_PER_HOUR && seconds % SECONDS_PER_HOUR === 0)
    return composedText(`${TEXTS}.hours`, {
      count: countParam(seconds / SECONDS_PER_HOUR),
    });
  return composedText(`${TEXTS}.minutes`, {
    count: countParam(Math.max(Math.round(seconds / SECONDS_PER_MINUTE), 1)),
  });
}

/** Next time a daily `m h * * *` schedule runs, in the server's clock. */
export function nextDailyRun(schedule: string, now: Date): Date {
  const parts = schedule.split(" ");
  const next = new Date(now);
  next.setHours(
    Number(parts[CRON_HOUR_INDEX] ?? 0),
    Number(parts[CRON_MINUTE_INDEX] ?? 0),
    0,
    0,
  );
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

function sweepItem(facts: PresetCacheFacts): KeyValueListItem {
  const next = {
    type: "datetime" as const,
    value: nextDailyRun(facts.sweepSchedule, facts.now).toISOString(),
    format: DATE_FORMAT,
  };
  const { lastSweep } = facts;
  return {
    id: "sweep",
    label: `${TEXTS}.sweep_label`,
    value: lastSweep
      ? composedText(`${TEXTS}.sweep_removed`, {
          count: countParam(lastSweep.removedFiles),
        })
      : `${TEXTS}.sweep_never`,
    detail: lastSweep
      ? composedText(`${TEXTS}.sweep_last`, {
          last: {
            type: "datetime",
            value: lastSweep.finishedAt.toISOString(),
            format: DATE_FORMAT,
          },
          next,
        })
      : composedText(`${TEXTS}.sweep_next`, { next }),
  };
}

/** The cache card of the image sizes page, worded as what the owner sees happen. */
export function buildPresetCacheItems(
  facts: PresetCacheFacts,
): KeyValueListItem[] {
  return [
    {
      id: "edits",
      label: `${TEXTS}.edits_label`,
      value: `${TEXTS}.edits_value`,
      detail: `${TEXTS}.edits_hint`,
    },
    {
      id: "public",
      label: `${TEXTS}.public_label`,
      value: duration(facts.publicLinkSeconds),
      detail: `${TEXTS}.public_hint`,
    },
    {
      id: "private",
      label: `${TEXTS}.private_label`,
      value: duration(facts.privateLinkSeconds),
      detail: `${TEXTS}.private_hint`,
    },
    sweepItem(facts),
  ];
}

/** Whether the module runs on the sizes it ships with, nothing configured. */
export function usesDefaultPresets(presets: MediaPresetConfig[]): boolean {
  return JSON.stringify(presets) === JSON.stringify(DEFAULT_PRESETS);
}

/** Photos and pictures a size is shown on; never a vector, which may be anything. */
const EXAMPLE_MIMETYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

interface AssetsTableModel {
  table: MediaAssetModel["table"];
}

async function newestPhoto(
  model: AssetsTableModel,
  folderIds: string[],
  publicFolderIds: string[] | undefined,
): Promise<MediaAsset | undefined> {
  const [row] = await model.table
    .getAll(folderIds.length === 1 ? folderIds[0] : folderIds, "folderId")
    .filter((asset) => {
      const photo = asset
        .key("isDeleting")
        .default(false)
        .eq(false)
        .and(
          ValueProxy.constant([...EXAMPLE_MIMETYPES]).includes(
            asset.key("mimetype").downcase(),
          ),
        );
      if (!publicFolderIds) return photo;
      return photo.and(
        asset
          .key("visibility")
          .eq("public")
          .or(
            asset
              .key("visibility")
              .eq("inherit")
              .and(
                ValueProxy.constant(publicFolderIds).includes(
                  asset.key("folderId"),
                ),
              ),
          ),
      );
    })
    .orderBy("createdAt", "desc")
    .slice(0, 1)
    .run();
  return row ? MediaAssetModel.fromDatabase(row) : undefined;
}

/** The image shown rendered by each size: the newest public photo of the folders, else their newest photo. */
export async function loadExampleImage(
  model: AssetsTableModel,
  folderIds: string[],
  publicFolderIds: string[],
): Promise<MediaAsset | undefined> {
  if (folderIds.length === 0) return undefined;
  const [publicPhoto, anyPhoto] = await Promise.all([
    newestPhoto(model, folderIds, publicFolderIds),
    newestPhoto(model, folderIds, undefined),
  ]);
  return publicPhoto ?? anyPhoto;
}
