import type { UploadBatchReport, UploadFailureReport } from "./useUploadApi";
import type {
  UploadBatchOutcome,
  UploadItem,
  UploadStatus,
} from "./useUploadQueue";

const MAX_REPORTED_FAILURES = 50;
const MAX_REASON_LENGTH = 500;

/** The statuses an upload ends in without having reached the library. */
export const FAILED_UPLOAD_STATUSES = new Set<UploadStatus>([
  "failed",
  "rejected",
]);

function headOf(batch: readonly UploadItem[]): UploadItem {
  const [head] = batch;
  if (!head) throw new Error("An upload batch holds at least one file");
  return head;
}

function failureReason(item: UploadItem): string {
  return (
    item.message && item.message !== item.failure
      ? `${item.failure}: ${item.message}`
      : (item.failure ?? "server")
  ).slice(0, MAX_REASON_LENGTH);
}

/** What the server is told of a batch: its counts, and the files that failed. */
export function buildReport(
  batchId: string,
  batch: UploadItem[],
): UploadBatchReport {
  const done = batch.filter((item) => item.status === "done");
  const failures: UploadFailureReport[] = batch
    .filter((item) => FAILED_UPLOAD_STATUSES.has(item.status))
    .slice(0, MAX_REPORTED_FAILURES)
    .map((item) => ({ name: item.name, reason: failureReason(item) }));
  return {
    batchId,
    folderId: headOf(batch).folderId,
    total: batch.length,
    uploaded: done.length,
    failed: batch.filter((item) => FAILED_UPLOAD_STATUSES.has(item.status))
      .length,
    size: done.reduce((total, item) => total + item.size, 0),
    failures,
  };
}

/** What the listeners of a settled batch are told. */
export function outcomeOf(
  report: UploadBatchReport,
  batch: UploadItem[],
): UploadBatchOutcome {
  return {
    batchId: report.batchId,
    folderId: report.folderId,
    folderName: headOf(batch).folderName,
    total: report.total,
    uploaded: report.uploaded,
    failed: report.failed,
    cancelled: batch.filter((item) => item.status === "cancelled").length,
  };
}

/** The files of the queue grouped by the batch they were dropped in. */
export function groupByBatch(
  items: readonly UploadItem[],
): Map<string, UploadItem[]> {
  const batches = new Map<string, UploadItem[]>();
  for (const item of items)
    batches.set(item.batchId, [...(batches.get(item.batchId) ?? []), item]);
  return batches;
}
