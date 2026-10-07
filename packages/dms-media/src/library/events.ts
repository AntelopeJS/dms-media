import { GetModel } from "@antelopejs/interface-database-decorators";
import { Logging } from "@antelopejs/interface-core/logging";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { type MediaEvent, MediaEventModel } from "../db";

export const MEDIA_EVENT_KINDS = [
  "upload.batch",
  "asset.delete",
  "asset.move",
  "asset.rename",
  "asset.alt",
  "asset.visibility",
  "asset.transform",
  "asset.revert",
  "folder.create",
  "folder.delete",
  "folder.rename",
  "folder.move",
  "folder.visibility",
  "folder.acl",
] as const;

export type MediaEventKind = (typeof MEDIA_EVENT_KINDS)[number];

export type MediaEventDetails = Record<string, string | number>;

export interface MediaEventInput {
  kind: MediaEventKind;
  targetName: string;
  folderId?: string;
  assetId?: string;
  count?: number;
  size?: number;
  details?: MediaEventDetails;
}

export interface MediaEventActor {
  tenantId: string;
  user: User;
}

/** Records an activity entry; a failure is logged and never fails the write. */
export async function recordMediaEvent(
  actor: MediaEventActor,
  input: MediaEventInput,
): Promise<void> {
  try {
    await GetModel(MediaEventModel, actor.tenantId).insert({
      kind: input.kind,
      actorId: actor.user._id,
      actorName: actor.user.name || actor.user.email,
      folderId: input.folderId,
      assetId: input.assetId,
      targetName: input.targetName,
      count: input.count,
      size: input.size,
      json_details: input.details ? JSON.stringify(input.details) : undefined,
    });
  } catch (error) {
    Logging.Error("Failed to record a media event", error);
  }
}

export function readEventDetails(event: MediaEvent): MediaEventDetails {
  if (!event.json_details) return {};
  try {
    const parsed: unknown = JSON.parse(event.json_details);
    return parsed && typeof parsed === "object"
      ? (parsed as MediaEventDetails)
      : {};
  } catch {
    return {};
  }
}
