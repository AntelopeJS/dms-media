import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantModel } from "@antelopejs/interface-dms/db";
import { OWNER_WILDCARD_PERMISSION } from "../constants";
import { MediaAssetModel, MediaFolderModel } from "../db";
import type { MediaEventAuthor } from "../library/events";
import {
  loadFolderAccess,
  type MediaRequestContext,
} from "../routes/media/context";

/** Thrown for a tenant id no tenant row has: nothing was read or written. */
class UnknownTenantError extends Error {
  constructor(readonly tenantId: string) {
    super(`unknown tenant "${tenantId}"`);
  }
}

/**
 * Refuses a tenant id no tenant row has, before a model opens on it: a
 * context provisions the tenant's linked folders, which would create a
 * phantom tenant's rows.
 */
async function requireTenant(tenantId: string): Promise<void> {
  if (!(await GetModel(TenantModel).get(tenantId)))
    throw new UnknownTenantError(tenantId);
}

/**
 * A context with every right in every folder of `tenantId`, attributed to
 * `author`: what the module acts through when no member is behind the
 * write, as for a procedure's action. It passes the owner-only checks.
 */
export async function resolveSystemContext(
  tenantId: string,
  author: MediaEventAuthor,
): Promise<MediaRequestContext> {
  await requireTenant(tenantId);
  const folderModel = GetModel(MediaFolderModel, tenantId);
  const access = await loadFolderAccess(
    tenantId,
    folderModel,
    new Set([OWNER_WILDCARD_PERMISSION]),
    [],
  );
  return {
    user: author,
    folderModel,
    assetModel: GetModel(MediaAssetModel, tenantId),
    ...access,
  };
}
