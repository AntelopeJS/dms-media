import { Logging } from "@antelopejs/interface-core/logging";
import { PublishMessage } from "@antelopejs/interface-dms";
import { MEDIA_LIBRARY_TOPIC } from "../constants";

/** Writes landing this close together (a bulk move, a batch) are announced once. */
const COALESCE_WINDOW_MS = 250;
/** Each uploaded file is announced, at most once per window during a batch. */
export const UPLOAD_ANNOUNCE_WINDOW_MS = 2000;
const LIBRARY_CHANGED = "changed";

let pending: ReturnType<typeof setTimeout> | undefined;
let pendingDueAt = 0;
let pendingChanges = 0;
let version = 0;

/**
 * Publishes the changes waiting to be announced as one message whose
 * `payload.count` says how many it stands for: a paused page counts that many
 * missed changes, not one per announcement.
 */
async function publishNow(): Promise<void> {
  pending = undefined;
  const count = pendingChanges;
  pendingChanges = 0;
  try {
    await PublishMessage(MEDIA_LIBRARY_TOPIC, LIBRARY_CHANGED, {
      payload: { count },
    });
  } catch (error) {
    Logging.Error("Failed to publish a media library change", error);
  }
}

/**
 * Tells the pages showing the library that it changed, so their blocks read
 * their routes again. The message carries only how many changes it stands
 * for: each block re-reads what its reader may see. An announcement already
 * due sooner absorbs this one.
 */
export function announceLibraryChange(delayMs = COALESCE_WINDOW_MS): void {
  version += 1;
  pendingChanges += 1;
  const dueAt = Date.now() + delayMs;
  if (pending && pendingDueAt <= dueAt) return;
  clearTimeout(pending);
  pendingDueAt = dueAt;
  pending = setTimeout(() => void publishNow(), delayMs);
  pending.unref?.();
}

/** Grows on each change, so a value computed from the library can tell it is stale. */
export function libraryVersion(): number {
  return version;
}

/** Drops an announcement still waiting, when the module stops. */
export function cancelLibraryChange(): void {
  clearTimeout(pending);
  pending = undefined;
  pendingChanges = 0;
}
