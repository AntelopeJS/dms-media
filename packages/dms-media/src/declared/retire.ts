import type {
  MediaContentKind,
  MediaDeclarationPrune,
  MediaDeclarationRetirement,
  MediaRetirementResult,
} from "@antelopejs/interface-dms-media";
import { cleanupAssetFiles, updateAssetMedia } from "../asset-lifecycle";
import type { MediaDeclaration, MediaFolder } from "../db";
import { recordMediaEvent } from "../library/events";
import { forgetFavorites } from "../library/favorites";
import {
  declarationPruneSchema,
  declarationRetirementSchema,
  describeDeclarationIssues,
} from "../validation/declared.schema";
import { assetStateHash } from "./assets";
import { folderStateHash } from "./folders";
import { waitForTenant } from "./readiness";
import {
  DECLARED_CONTENT_AUTHOR,
  type DeclaredModels,
  declaredModels,
  judgeMemberChange,
  parseDeclaration,
  withDeclarationLock,
} from "./records";

/** A retirement's outcome before it is labelled with the kind and key. */
type RetirementOutcome = Omit<MediaRetirementResult, "kind" | "key">;

/** Deletes a declared file still as declared, the way a member's delete does. */
async function retireAsset(
  models: DeclaredModels,
  record: MediaDeclaration,
): Promise<RetirementOutcome> {
  const { assetModel } = models;
  const stored = await assetModel.get(record.targetId);
  const asset = stored && !stored.isDeleting ? stored : undefined;
  const change = judgeMemberChange(
    record,
    asset,
    asset && assetStateHash(asset),
  );
  if (change || !asset) return change ?? { status: "deleted" };
  // Tombstoned only while untouched, so a member edit racing it wins.
  const isTombstoned = await updateAssetMedia(
    assetModel,
    asset,
    { isDeleting: true },
    { preserveDetails: true },
  );
  if (!isTombstoned) {
    const current = await assetModel.get(asset._id);
    return current && !current.isDeleting
      ? { status: "preserved", id: asset._id }
      : { status: "deleted" };
  }
  await cleanupAssetFiles(assetModel, asset._id);
  await forgetFavorites(models.tenantId, [asset._id]);
  await recordMediaEvent(
    { tenantId: models.tenantId, user: DECLARED_CONTENT_AUTHOR },
    {
      kind: "asset.delete",
      targetName: asset.name,
      folderId: asset.folderId,
      assetId: asset._id,
      size: asset.size,
    },
  );
  return { status: "removed", id: asset._id };
}

async function holdsContent(
  models: DeclaredModels,
  folder: MediaFolder,
): Promise<boolean> {
  const [children, assets] = await Promise.all([
    models.folderModel.getChildren(folder._id),
    models.assetModel.getByFolder(folder._id),
  ]);
  return children.length > 0 || assets.length > 0;
}

/**
 * Deletes a declared folder still as declared and empty. A folder holding
 * anything else, members' files or folders still declared, is never deleted
 * with its content: it stays, and is no longer the code's.
 */
async function retireFolder(
  models: DeclaredModels,
  record: MediaDeclaration,
): Promise<RetirementOutcome> {
  const { folderModel } = models;
  const folder = await folderModel.get(record.targetId);
  const change = judgeMemberChange(
    record,
    folder,
    folder && folderStateHash(folder),
  );
  if (change || !folder) return change ?? { status: "deleted" };
  if (await holdsContent(models, folder))
    return { status: "preserved", id: folder._id };
  if (!(await folderModel.deleteDeclared(folder))) {
    const current = await folderModel.get(folder._id);
    return current
      ? { status: "preserved", id: folder._id }
      : { status: "deleted" };
  }
  await forgetFavorites(models.tenantId, [folder._id]);
  await recordMediaEvent(
    { tenantId: models.tenantId, user: DECLARED_CONTENT_AUTHOR },
    {
      kind: "folder.delete",
      targetName: folder.name,
      folderId: folder.parentId,
      count: 0,
      size: 0,
      details: { files: 0, folders: 1 },
    },
  );
  return { status: "removed", id: folder._id };
}

const RETIRERS: Record<
  MediaContentKind,
  (
    models: DeclaredModels,
    record: MediaDeclaration,
  ) => Promise<RetirementOutcome>
> = {
  asset: retireAsset,
  folder: retireFolder,
};

/** Retires one declaration under its key's lock; whatever stays is the members' from now on. */
function retireKey(
  models: DeclaredModels,
  kind: MediaContentKind,
  key: string,
): Promise<MediaRetirementResult> {
  return withDeclarationLock(models.tenantId, kind, key, async () => {
    const record = await models.declarationModel.findByKey(kind, key);
    if (!record) return { kind, key, status: "unknown" };
    const outcome = await RETIRERS[kind](models, record);
    await models.declarationModel.delete(record._id);
    return { kind, key, ...outcome };
  });
}

/** Implements `RetireMediaDeclaration`. */
export async function retireDeclaration(
  input: MediaDeclarationRetirement,
): Promise<MediaRetirementResult> {
  const kind = (input as { kind?: unknown } | undefined)?.kind;
  const retirement = parseDeclaration(
    kind === "folder" ? "folder" : "asset",
    input,
    declarationRetirementSchema,
  );
  await waitForTenant(retirement.tenantId);
  return retireKey(
    declaredModels(retirement.tenantId),
    retirement.kind,
    retirement.key,
  );
}

/** Files first, then folders from the deepest, so a folder is empty of its declared content when its turn comes. */
async function retirementOrder(
  models: DeclaredModels,
  records: MediaDeclaration[],
): Promise<MediaDeclaration[]> {
  const depths = new Map<string, number>();
  for (const record of records) {
    if (record.kind !== "folder") continue;
    const folder = await models.folderModel.get(record.targetId);
    depths.set(record._id, folder?.path.length ?? 0);
  }
  const assets = records.filter((record) => record.kind === "asset");
  const folders = records
    .filter((record) => record.kind === "folder")
    .sort((a, b) => (depths.get(b._id) ?? 0) - (depths.get(a._id) ?? 0));
  return [...assets, ...folders];
}

/** Implements `PruneMediaDeclarations`. */
export async function pruneDeclarations(
  input: MediaDeclarationPrune,
): Promise<MediaRetirementResult[]> {
  const parsed = declarationPruneSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `Media declarations prune: ${describeDeclarationIssues(parsed.error)}`,
    );
  const { prefix, tenantId } = parsed.data;
  const keep = new Set(parsed.data.keep);
  await waitForTenant(tenantId);
  const models = declaredModels(tenantId);
  const stale = (await models.declarationModel.getAll()).filter(
    (record) => record.key.startsWith(prefix) && !keep.has(record.key),
  );
  const results: MediaRetirementResult[] = [];
  for (const record of await retirementOrder(models, stale))
    results.push(await retireKey(models, record.kind, record.key));
  return results;
}
