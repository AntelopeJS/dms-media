import type { ComposedText } from "@antelopejs/interface-dms/base/types";
import type { MediaEvent, MediaFolder } from "../db";
import { folderPath } from "./activity";
import { composedText, countParam } from "./composed-text";
import { readEventDetails } from "./events";

export interface UploadBatchRow {
  _id: string;
  folderId: string;
  folder: string;
  by: string;
  byLine: ComposedText;
  files: number;
  failed: number;
  size: number;
  result: UploadBatchResult;
  resultDetail: ComposedText | null;
  finishedAt: string;
}

type UploadBatchResult = "complete" | "partial" | "failed";

const HISTORY_TEXTS = "dms_media.uploads.history";

interface BatchAccumulator {
  id: string;
  folderId: string;
  by: string;
  files: number;
  failed: number;
  size: number;
  finishedAt: Date;
}

function batchKey(event: MediaEvent): string {
  return String(readEventDetails(event).batchId ?? event._id);
}

function accumulate(
  batches: Map<string, BatchAccumulator>,
  event: MediaEvent,
): void {
  const key = batchKey(event);
  const batch = batches.get(key) ?? {
    id: key,
    folderId: event.folderId ?? "",
    by: event.actorName,
    files: 0,
    failed: 0,
    size: 0,
    finishedAt: event.createdAt,
  };
  if (event.kind === "upload.batch") {
    batch.failed = Number(readEventDetails(event).failed ?? 0);
  } else {
    batch.files += 1;
    batch.size += event.size ?? 0;
  }
  if (event.createdAt > batch.finishedAt) batch.finishedAt = event.createdAt;
  batches.set(key, batch);
}

function resultOf(batch: BatchAccumulator): UploadBatchRow["result"] {
  if (batch.failed === 0) return "complete";
  return batch.files === 0 ? "failed" : "partial";
}

/** Upload batches, newest first, from the per-file upload events and the batch summaries. */
export function buildUploadBatches(
  events: MediaEvent[],
  foldersById: Map<string, MediaFolder>,
): UploadBatchRow[] {
  const batches = new Map<string, BatchAccumulator>();
  for (const event of events) {
    if (event.kind === "asset.upload" || event.kind === "upload.batch")
      accumulate(batches, event);
  }
  return [...batches.values()]
    .sort(
      (left, right) => right.finishedAt.getTime() - left.finishedAt.getTime(),
    )
    .map((batch) => ({
      _id: batch.id,
      folderId: batch.folderId,
      folder: folderPath(batch.folderId, foldersById),
      by: batch.by,
      byLine: composedText(`${HISTORY_TEXTS}.by_line`, { name: batch.by }),
      files: batch.files,
      failed: batch.failed,
      size: batch.size,
      result: resultOf(batch),
      resultDetail: failureDetail(batch),
      finishedAt: batch.finishedAt.toISOString(),
    }));
}

function failureDetail(batch: BatchAccumulator): ComposedText | null {
  if (batch.failed === 0) return null;
  return composedText(`${HISTORY_TEXTS}.failed_detail`, {
    failed: countParam(batch.failed),
    total: batch.files + batch.failed,
  });
}
