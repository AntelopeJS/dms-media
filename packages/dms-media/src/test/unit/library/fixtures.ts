import type { MediaAsset, MediaEvent, MediaFolder } from "../../../db";

const EPOCH = new Date("2026-01-01T00:00:00Z");

export function folder(
  id: string,
  parentId?: string,
  path: string[] = [],
): MediaFolder {
  return {
    _id: id,
    name: id,
    parentId,
    path,
    visibility: "private",
    createdAt: EPOCH,
    updatedAt: EPOCH,
  } as MediaFolder;
}

export function asset(
  id: string,
  overrides: Partial<MediaAsset> = {},
): MediaAsset {
  return {
    _id: id,
    folderId: "root",
    name: `${id}.jpg`,
    mimetype: "image/jpeg",
    size: 100,
    visibility: "inherit",
    createdAt: EPOCH,
    updatedAt: EPOCH,
    ...overrides,
  } as MediaAsset;
}

export function event(
  id: string,
  overrides: Partial<MediaEvent> = {},
): MediaEvent {
  return {
    _id: id,
    kind: "asset.upload",
    actorId: "user",
    actorName: "Camille",
    targetName: `${id}.jpg`,
    folderId: "root",
    createdAt: EPOCH,
    ...overrides,
  } as MediaEvent;
}
