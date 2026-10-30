import type { MediaAsset, MediaEvent, MediaFolder } from "../../../db";

const EPOCH = new Date("2026-01-01T00:00:00Z");

export function folder(
  id: string,
  parentId?: string,
  path: string[] = [],
  overrides: Partial<MediaFolder> = {},
): MediaFolder {
  return {
    _id: id,
    name: id,
    parentId,
    path,
    visibility: "private",
    createdAt: EPOCH,
    updatedAt: EPOCH,
    ...overrides,
  };
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
    storageKey: `${id}.jpg`,
    visibility: "inherit",
    mediaRevision: "revision",
    json_retiredFiles: "[]",
    createdBy: "user",
    createdAt: EPOCH,
    updatedAt: EPOCH,
    ...overrides,
  };
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
  };
}
