import {
  HTTPResult,
  JSONBody,
  Parameter,
  Post,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { Logging } from "@antelopejs/interface-core/logging";
import type { MediaAsset, MediaFolder } from "../../db";
import { downloadStorageBytes } from "../../derivatives";
import { portableName, uniqueEntryName, ZipWriter } from "../../library/zip";
import {
  bulkIdsSchema,
  bulkMoveSchema,
  bulkVisibilitySchema,
} from "../../validation/library.schema";
import { parseBody } from "../../validation/media.schema";
import { moveAsset, removeAsset, setAssetVisibility } from "./asset-actions";
import { requireReadableAsset } from "./assets";
import { MediaApiController } from "./controller";
import {
  getDescendantFolders,
  type MediaRequestContext,
  requireFolderRight,
} from "./context";
import { isString } from "../../guards";

const HTTP_OK = 200;
const HTTP_INTERNAL_ERROR = 500;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const MAX_ZIP_FILES = 200;
const MAX_ZIP_BYTES = 1024 * 1024 * 1024;
const ZIP_CONTENT_TYPE = "application/zip";
const ZIP_FILENAME = "media.zip";
const ZIP_DIRECTORY_SEPARATOR = "/";
const NON_ASCII_OR_QUOTE = /[^\x20-\x7e]|"/g;

interface ZipEntry {
  asset: MediaAsset;
  directory: string;
}

type AssetOperation = (
  context: MediaRequestContext,
  asset: MediaAsset,
) => Promise<void>;

export interface BulkRefusal {
  id: string;
  status: number;
  message: string;
}

export interface BulkOutcome {
  done: string[];
  refused: BulkRefusal[];
}

/** Runs one operation per asset in order, keeping going past the ones refused. */
async function applyToEach(
  context: MediaRequestContext,
  ids: string[],
  operation: AssetOperation,
): Promise<BulkOutcome> {
  const outcome: BulkOutcome = { done: [], refused: [] };
  for (const id of new Set(ids)) {
    try {
      const asset = await requireReadableAsset(context, id);
      await operation(context, asset);
      outcome.done.push(id);
    } catch (error) {
      if (error instanceof HTTPResult) {
        const body: unknown = error.getBody();
        const message = isString(body) ? body : JSON.stringify(body);
        outcome.refused.push({
          id,
          status: error.getStatus(),
          message: message ?? "",
        });
      } else {
        outcome.refused.push({
          id,
          status: HTTP_INTERNAL_ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return outcome;
}

function assertZipLimits(assets: MediaAsset[]): void {
  assert(
    assets.length <= MAX_ZIP_FILES,
    HTTP_PAYLOAD_TOO_LARGE,
    `A zip holds at most ${MAX_ZIP_FILES} files`,
  );
  const size = assets.reduce((total, asset) => total + asset.size, 0);
  assert(
    size <= MAX_ZIP_BYTES,
    HTTP_PAYLOAD_TOO_LARGE,
    "Selection too large to zip",
  );
}

async function loadZipAssets(
  context: MediaRequestContext,
  ids: string[],
): Promise<ZipEntry[]> {
  const unique = [...new Set(ids)];
  assert(
    unique.length <= MAX_ZIP_FILES,
    HTTP_PAYLOAD_TOO_LARGE,
    `A zip holds at most ${MAX_ZIP_FILES} files`,
  );
  const assets = await Promise.all(
    unique.map((id) => requireReadableAsset(context, id)),
  );
  assertZipLimits(assets);
  return assets.map((asset) => ({ asset, directory: "" }));
}

/** Each folder's path inside the zip, relative to the zipped folder. */
function zipDirectories(
  root: MediaFolder,
  descendants: MediaFolder[],
): Map<string, string> {
  const directories = new Map<string, string>([[root._id, ""]]);
  for (const folder of descendants) {
    const parent = directories.get(folder.parentId ?? "") ?? "";
    directories.set(
      folder._id,
      `${parent}${portableName(folder.name)}${ZIP_DIRECTORY_SEPARATOR}`,
    );
  }
  return directories;
}

async function loadFolderZipEntries(
  context: MediaRequestContext,
  folderId: string,
): Promise<ZipEntry[]> {
  const root = requireFolderRight(context, folderId, "read");
  const descendants = getDescendantFolders(context, folderId).filter((folder) =>
    context.access.readable.has(folder._id),
  );
  const directories = zipDirectories(root, descendants);
  const assets = (
    await context.assetModel.getBy("folderId", ...directories.keys())
  ).filter((asset) => !asset.isDeleting);
  assertZipLimits(assets);
  return assets.map((asset) => ({
    asset,
    directory: directories.get(asset.folderId) ?? "",
  }));
}

async function streamZip(
  entries: ZipEntry[],
  result: HTTPResult,
): Promise<void> {
  const stream = result.getWriteStream(ZIP_CONTENT_TYPE, HTTP_OK);
  const zip = new ZipWriter((chunk) => stream.write(chunk));
  const taken = new Set<string>();
  try {
    for (const { asset, directory } of entries) {
      const bytes = await downloadStorageBytes(asset.storageKey, asset.storage);
      zip.addFile(
        uniqueEntryName(asset.name, taken, directory),
        bytes,
        asset.updatedAt,
      );
    }
    zip.finish();
  } finally {
    stream.end();
  }
}

/** An attachment header: an ASCII name for old clients, the exact one in UTF-8. */
function attachmentHeader(filename: string): string {
  const ascii = filename.replace(NON_ASCII_OR_QUOTE, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function zipResponse(entries: ZipEntry[], filename: string): HTTPResult {
  const result = new HTTPResult(HTTP_OK);
  result.addHeader("Content-Disposition", attachmentHeader(filename));
  streamZip(entries, result).catch((error: unknown) =>
    Logging.Error("Failed to stream a media zip", error),
  );
  return result;
}

export class MediaBulkController extends MediaApiController {
  @Post("/assets/bulk/move")
  async bulkMove(@JSONBody() body: unknown) {
    const { ids, folderId } = parseBody(body, bulkMoveSchema);
    const context = await this.resolveContext();
    return applyToEach(context, ids, (ctx, asset) =>
      moveAsset(ctx, asset, folderId),
    );
  }

  @Post("/assets/bulk/visibility")
  async bulkVisibility(@JSONBody() body: unknown) {
    const { ids, visibility } = parseBody(body, bulkVisibilitySchema);
    const context = await this.resolveContext();
    return applyToEach(context, ids, (ctx, asset) =>
      setAssetVisibility(ctx, asset, visibility),
    );
  }

  @Post("/assets/bulk/delete")
  async bulkDelete(@JSONBody() body: unknown) {
    const { ids } = parseBody(body, bulkIdsSchema);
    const context = await this.resolveContext();
    return applyToEach(context, ids, removeAsset);
  }

  @Post("/assets/zip")
  async zip(@JSONBody() body: unknown) {
    const { ids } = parseBody(body, bulkIdsSchema);
    const context = await this.resolveContext();
    return zipResponse(await loadZipAssets(context, ids), ZIP_FILENAME);
  }

  @Post("/folders/:folderId/zip")
  async zipFolder(@Parameter("folderId", "param") folderId: string) {
    const context = await this.resolveContext();
    const entries = await loadFolderZipEntries(context, folderId);
    const folder = requireFolderRight(context, folderId, "read");
    return zipResponse(entries, `${portableName(folder.name)}.zip`);
  }
}
