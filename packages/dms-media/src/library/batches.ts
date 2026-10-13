import type { ComposedText } from "@antelopejs/interface-dms/base/types";
import type { MediaEvent, MediaFolder } from "../db";
import { folderPath } from "./activity";
import { composedBytes, composedText, countParam } from "./composed-text";
import {
  batchIdOf,
  latestBatchReports,
  readEventDetails,
  UPLOAD_KIND,
} from "./events";

export interface UploadBatchRow {
  _id: string;
  folderId: string;
  folder: string;
  by: string;
  byLine: ComposedText;
  files: number;
  failed: number;
  size: number;
  sizeLabel: ComposedText;
  result: UploadBatchResult;
  /** `yes` while the batch still has failed files reported in the last 24 h. */
  attention: BatchAttention;
  resultDetail: ComposedText | null;
  finishedAt: string;
}

type UploadBatchResult = "complete" | "partial" | "failed";

type BatchAttention = "yes" | "no";

/** How long a failed upload keeps asking for attention. */
export const FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;

interface UploadFailure {
  name: string;
  reason?: string;
}

const HISTORY_TEXTS = "dms_media.uploads.history";
const FAILURES_SHOWN = 3;
const NAME_SEPARATOR = ", ";
const MORE_NAMES = "…";
/** Files sent outside a batch (an API client) in the same minute read as one batch. */
const LOOSE_UPLOAD_WINDOW_MS = 60 * 1000;

interface BatchAccumulator {
  id: string;
  folderId: string;
  by: string;
  files: number;
  failed: number;
  failures: UploadFailure[];
  size: number;
  finishedAt: Date;
  reportedAt?: Date;
}

function newBatch(key: string, event: MediaEvent): BatchAccumulator {
  return {
    id: key,
    folderId: event.folderId ?? "",
    by: event.actorName,
    files: 0,
    failed: 0,
    failures: [],
    size: 0,
    finishedAt: event.createdAt,
  };
}

/** The files a batch report names as failed, with their reasons. */
function readBatchFailures(event: MediaEvent): UploadFailure[] {
  const raw = readEventDetails(event).failures;
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UploadFailure[]) : [];
  } catch {
    return [];
  }
}

function looseUploadKey(event: MediaEvent): string {
  const window = Math.floor(event.createdAt.getTime() / LOOSE_UPLOAD_WINDOW_MS);
  return `loose:${event.actorId}:${event.folderId ?? ""}:${window}`;
}

function accumulateUpload(
  batches: Map<string, BatchAccumulator>,
  event: MediaEvent,
): void {
  const key = batchIdOf(event) ?? looseUploadKey(event);
  const batch = batches.get(key) ?? newBatch(key, event);
  batch.files += 1;
  batch.size += event.size ?? 0;
  if (event.createdAt > batch.finishedAt) batch.finishedAt = event.createdAt;
  batches.set(key, batch);
}

function applyReport(
  batches: Map<string, BatchAccumulator>,
  key: string,
  report: MediaEvent,
): void {
  const batch = batches.get(key) ?? newBatch(key, report);
  batch.failed = Number(readEventDetails(report).failed ?? 0);
  batch.failures = readBatchFailures(report);
  batch.reportedAt = report.createdAt;
  if (report.createdAt > batch.finishedAt) batch.finishedAt = report.createdAt;
  batches.set(key, batch);
}

function resultOf(files: number, failed: number): UploadBatchResult {
  if (failed === 0) return "complete";
  return files === 0 ? "failed" : "partial";
}

function failureDetail(batch: BatchAccumulator): ComposedText | null {
  if (batch.failed === 0) return null;
  const names = batch.failures
    .slice(0, FAILURES_SHOWN)
    .map((failure) =>
      failure.reason ? `${failure.name} (${failure.reason})` : failure.name,
    );
  if (batch.failures.length > FAILURES_SHOWN) names.push(MORE_NAMES);
  const params = {
    failed: countParam(batch.failed),
    total: batch.files + batch.failed,
  };
  if (names.length === 0)
    return composedText(`${HISTORY_TEXTS}.failed_detail`, params);
  return composedText(`${HISTORY_TEXTS}.failed_names`, {
    ...params,
    names: names.join(NAME_SEPARATOR),
  });
}

/**
 * Upload batches, newest first, from the per-file upload events and the batch
 * reports. Only the newest report of a batch counts: a retry replaces it.
 */
function isFailingSince(batch: BatchAccumulator, since: Date): boolean {
  return (
    batch.failed > 0 && Boolean(batch.reportedAt && batch.reportedAt >= since)
  );
}

export function buildUploadBatches(
  events: MediaEvent[],
  foldersById: Map<string, MediaFolder>,
  now: Date = new Date(),
): UploadBatchRow[] {
  const since = new Date(now.getTime() - FAILURE_WINDOW_MS);
  const batches = new Map<string, BatchAccumulator>();
  for (const event of events) {
    if (event.kind === UPLOAD_KIND) accumulateUpload(batches, event);
  }
  for (const [key, report] of latestBatchReports(events))
    applyReport(batches, key, report);
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
      sizeLabel: composedBytes(batch.size),
      result: resultOf(batch.files, batch.failed),
      resultDetail: failureDetail(batch),
      attention: isFailingSince(batch, since) ? "yes" : "no",
      finishedAt: batch.finishedAt.toISOString(),
    }));
}

/**
 * Files still failed in the last 24 h: the newest report of each batch,
 * summed. Fed the same events as the upload history, it counts exactly the
 * rows that history flags for attention.
 */
export function countFailedUploads(
  events: MediaEvent[],
  now: Date = new Date(),
): number {
  const since = now.getTime() - FAILURE_WINDOW_MS;
  return [...latestBatchReports(events).values()]
    .filter((report) => report.createdAt.getTime() >= since)
    .reduce(
      (total, report) => total + Number(readEventDetails(report).failed ?? 0),
      0,
    );
}
