import { Logging } from "@antelopejs/interface-core/logging";
import type { MediaAsset } from "../db";
import type { MediaEventKind } from "../library/events";
import { isAnyTriggerArmed } from "./channel";
import { evaluateQuotaGrowth, evaluateQuotaShrink } from "./quota-alerts";
import { FolderLookup, type RecordedMediaEvent } from "./recorded";
import { emitFileDeleted, fileDeletedChannel } from "./triggers/file-deleted";
import {
  emitFilePublished,
  filePublishedChannel,
  type PublishReason,
} from "./triggers/file-published";
import {
  emitFileUploaded,
  fileUploadedChannel,
} from "./triggers/file-uploaded";
import {
  emitLibraryEvent,
  libraryEventChannel,
} from "./triggers/library-event";

const GROWING_KINDS = new Set<MediaEventKind>([
  "asset.upload",
  "asset.transform",
]);
const SHRINKING_KINDS = new Set<MediaEventKind>([
  "asset.delete",
  "folder.delete",
  "asset.revert",
]);
const DELETING_KINDS = new Set<MediaEventKind>([
  "asset.delete",
  "folder.delete",
]);
const PUBLISH_REASONS = new Map<MediaEventKind, PublishReason>([
  ["asset.visibility", "visibility"],
  ["asset.move", "move"],
  ["folder.visibility", "folder"],
]);

async function assetsOf(event: RecordedMediaEvent): Promise<MediaAsset[]> {
  const { assets, loadAssets } = event.facts;
  return assets ?? (await loadAssets?.()) ?? [];
}

async function emitFileChanges(
  event: RecordedMediaEvent,
  lookup: FolderLookup,
): Promise<void> {
  const { kind } = event.input;
  const { facts } = event;
  if (kind === "asset.upload") {
    const isWatched =
      fileUploadedChannel.isArmed || filePublishedChannel.isArmed;
    const assets = isWatched ? await assetsOf(event) : [];
    await emitFileUploaded(event, lookup, assets);
    await emitFilePublished(event, lookup, assets, "created");
    return;
  }
  if (DELETING_KINDS.has(kind) && fileDeletedChannel.isArmed) {
    await emitFileDeleted(event, lookup, await assetsOf(event));
    return;
  }
  const reason = PUBLISH_REASONS.get(kind);
  if (reason && facts.previousEffective && filePublishedChannel.isArmed)
    await emitFilePublished(
      event,
      lookup,
      await assetsOf(event),
      reason,
      facts.previousEffective,
    );
}

async function dispatch(event: RecordedMediaEvent): Promise<void> {
  const lookup = new FolderLookup(
    event.actor.tenantId,
    event.facts.foldersById,
  );
  if (libraryEventChannel.isArmed) await emitLibraryEvent(event, lookup);
  await emitFileChanges(event, lookup);
  if (GROWING_KINDS.has(event.input.kind)) await evaluateQuotaGrowth(event);
}

/**
 * Hands a recorded activity entry to the media triggers armed on this
 * instance. Whatever fails is logged: a trigger never fails the write.
 */
export async function notifyMediaEvent(
  event: RecordedMediaEvent,
): Promise<void> {
  try {
    if (SHRINKING_KINDS.has(event.input.kind))
      await evaluateQuotaShrink(event.actor.tenantId);
    if (isAnyTriggerArmed()) await dispatch(event);
  } catch (error) {
    Logging.Warn(
      `[dms-media] Automation triggers failed on a "${event.input.kind}" entry:`,
      error,
    );
  }
}
