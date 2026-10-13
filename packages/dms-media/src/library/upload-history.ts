import { GetModel } from "@antelopejs/interface-database-decorators";
import { type MediaEvent, MediaEventModel } from "../db";
import { FAILURE_WINDOW_MS } from "./batches";
import { listEventsSince } from "./events";

/** The newest events the upload history reads, besides every one of the last 24 h. */
const HISTORY_EVENTS_SCANNED = 1000;

/**
 * The events the upload history and the failed-uploads counter both read: the
 * newest ones and all of the last 24 h, in folders that still exist and the
 * reader can open. A deleted folder takes its failures out of the counter.
 */
export async function loadUploadHistoryEvents(
  tenantId: string,
  readableFolderIds: ReadonlySet<string>,
  now: Date,
): Promise<MediaEvent[]> {
  const [recent, today] = await Promise.all([
    GetModel(MediaEventModel, tenantId).listRecent(HISTORY_EVENTS_SCANNED),
    listEventsSince(tenantId, new Date(now.getTime() - FAILURE_WINDOW_MS)),
  ]);
  const byId = new Map(
    [...recent, ...today].map((event) => [event._id, event]),
  );
  return [...byId.values()]
    .filter((event) => event.folderId && readableFolderIds.has(event.folderId))
    .sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );
}
