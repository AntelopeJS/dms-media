import { Logging } from "@antelopejs/interface-core/logging";
import { PublishMessage } from "@antelopejs/interface-dms";
import { MEDIA_LIBRARY_TOPIC } from "../constants";

/** Writes landing this close together (a bulk move, a batch) are announced once. */
const COALESCE_WINDOW_MS = 250;
const LIBRARY_CHANGED = "changed";

let pending: ReturnType<typeof setTimeout> | undefined;

async function publishNow(): Promise<void> {
  pending = undefined;
  try {
    await PublishMessage(MEDIA_LIBRARY_TOPIC, LIBRARY_CHANGED);
  } catch (error) {
    Logging.Error("Failed to publish a media library change", error);
  }
}

/**
 * Tells the pages showing the library that it changed, so their blocks read
 * their routes again. The message carries nothing: each block re-reads what
 * its reader may see.
 */
export function announceLibraryChange(): void {
  if (pending) return;
  pending = setTimeout(() => void publishNow(), COALESCE_WINDOW_MS);
  pending.unref?.();
}

/** Drops an announcement still waiting, when the module stops. */
export function cancelLibraryChange(): void {
  clearTimeout(pending);
  pending = undefined;
}
