import { assert } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { GetApiBaseUrl } from "@antelopejs/interface-dms/api-base-url";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { GetClientBaseUrl } from "@antelopejs/interface-dms/client-base-url";
import { CreateReadUrl } from "@antelopejs/interface-file-storage";
import { feedingBinding } from "../bindings";
import { getMediaConfig } from "../config";
import type { MediaAsset, MediaFolder } from "../db";
import {
  AUTOMATION_AUTHOR,
  DECLARED_CONTENT_AUTHOR,
} from "../declared/records";
import { ensureDerivative } from "../derivatives";
import { fileLink } from "../library/links";
import { resolvePublicOrigin } from "../routes/media/controller";
import {
  type MediaRequestContext,
  requireVisibleFolder,
} from "../routes/media/context";
import { isActiveContent } from "../routes/media/delivery-headers";
import { assertDerivableAsset, requirePreset } from "../routes/media/delivery";

const HTTP_UNPROCESSABLE_ENTITY = 422;
const TRAILING_SLASHES = /\/+$/;
const MODULE_AUTHORS = new Map(
  [DECLARED_CONTENT_AUTHOR, AUTOMATION_AUTHOR].map((author) => [
    author._id,
    author.name,
  ]),
);

/** A file with its folder, where that folder sits, who added it and its links. */
export interface FileDescription {
  asset: MediaAsset;
  folder: MediaFolder;
  folderPath: string;
  binding: string | null;
  uploaderName: string | null;
  deliveryUrl: string;
  dashboardUrl: string;
}

/** A signed link to a file or one of its image sizes. */
export interface FileReadUrl {
  url: string;
  expiresAt: string | null;
}

async function uploaderName(createdBy: string): Promise<string | null> {
  const moduleAuthor = MODULE_AUTHORS.get(createdBy);
  if (moduleAuthor) return moduleAuthor;
  const user = await GetModel(UserModel).get(createdBy);
  return user ? user.name || user.email : null;
}

/** The origin `/media` links start with: the module's `publicBaseUrl`, else the DMS `apiBaseUrl`. */
async function deliveryOrigin(): Promise<string> {
  return resolvePublicOrigin(
    getMediaConfig().publicBaseUrl,
    await GetApiBaseUrl(),
  );
}

async function dashboardOrigin(): Promise<string> {
  const base = await GetClientBaseUrl().catch(() => undefined);
  return (base ?? "").replace(TRAILING_SLASHES, "");
}

export async function describeFile(
  context: MediaRequestContext,
  asset: MediaAsset,
  deliveryPath: string,
): Promise<FileDescription> {
  const folder = requireVisibleFolder(context, asset.folderId);
  const [uploader, apiOrigin, clientOrigin] = await Promise.all([
    uploaderName(asset.createdBy),
    deliveryOrigin(),
    dashboardOrigin(),
  ]);
  return {
    asset,
    folder,
    folderPath: [...folder.path, folder._id]
      .map((id) => context.foldersById.get(id)?.name ?? "")
      .join("/"),
    binding: feedingBinding(folder, context.foldersById) ?? null,
    uploaderName: uploader,
    deliveryUrl: `${apiOrigin}${deliveryPath}`,
    dashboardUrl: `${clientOrigin}${fileLink(asset._id)}`,
  };
}

/**
 * A signed link to the file, or to one of its image sizes, valid
 * `ttlSeconds`. Active content (SVG, XML) is linked only through an image
 * size: the storage serves an original without the delivery's sandbox.
 */
export async function createFileReadUrl(
  context: MediaRequestContext,
  asset: MediaAsset,
  presetId: string | undefined,
  ttlSeconds: number,
): Promise<FileReadUrl> {
  let storageKey = asset.storageKey;
  if (presetId) {
    const preset = requirePreset(presetId);
    assertDerivableAsset(asset);
    storageKey = await ensureDerivative(context.assetModel, asset, preset);
  } else {
    assert(
      !isActiveContent(asset.mimetype),
      HTTP_UNPROCESSABLE_ENTITY,
      "A signed link to an SVG or XML original is refused: ask for an image size",
    );
  }
  const readUrl = await CreateReadUrl(storageKey, ttlSeconds, asset.storage);
  return {
    url: readUrl.url,
    expiresAt: readUrl.expiresAt
      ? new Date(readUrl.expiresAt).toISOString()
      : null,
  };
}
