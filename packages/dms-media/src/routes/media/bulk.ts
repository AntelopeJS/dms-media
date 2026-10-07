import { HTTPResult, JSONBody, Post } from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { Logging } from "@antelopejs/interface-core/logging";
import type { MediaAsset } from "../../db";
import { downloadStorageBytes } from "../../derivatives";
import { uniqueEntryName, ZipWriter } from "../../library/zip";
import {
  bulkIdsSchema,
  bulkMoveSchema,
  bulkVisibilitySchema,
} from "../../validation/library.schema";
import { moveAsset, removeAsset, setAssetVisibility } from "./asset-actions";
import { requireReadableAsset } from "./assets";
import { MediaApiController } from "./controller";
import type { MediaRequestContext } from "./context";

const HTTP_OK = 200;
const HTTP_INTERNAL_ERROR = 500;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const MAX_ZIP_FILES = 200;
const MAX_ZIP_BYTES = 1024 * 1024 * 1024;
const ZIP_CONTENT_TYPE = "application/zip";
const ZIP_FILENAME = "media.zip";

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

function describeFailure(id: string, error: unknown): BulkRefusal {
  if (error instanceof HTTPResult) {
    const body: unknown = error.getBody();
    return { id, status: error.getStatus(), message: String(body ?? "") };
  }
  return {
    id,
    status: HTTP_INTERNAL_ERROR,
    message: error instanceof Error ? error.message : String(error),
  };
}

/** Runs one operation per asset in order, keeping going past the ones refused. */
async function applyToEach(
  context: MediaRequestContext,
  ids: string[],
  operation: AssetOperation,
): Promise<BulkOutcome> {
  const outcome: BulkOutcome = { done: [], refused: [] };
  for (const id of [...new Set(ids)]) {
    try {
      const asset = await requireReadableAsset(context, id);
      await operation(context, asset);
      outcome.done.push(id);
    } catch (error) {
      outcome.refused.push(describeFailure(id, error));
    }
  }
  return outcome;
}

async function loadZipAssets(
  context: MediaRequestContext,
  ids: string[],
): Promise<MediaAsset[]> {
  const unique = [...new Set(ids)];
  assert(
    unique.length <= MAX_ZIP_FILES,
    HTTP_PAYLOAD_TOO_LARGE,
    `A zip holds at most ${MAX_ZIP_FILES} files`,
  );
  const assets = await Promise.all(
    unique.map((id) => requireReadableAsset(context, id)),
  );
  const size = assets.reduce((total, asset) => total + asset.size, 0);
  assert(
    size <= MAX_ZIP_BYTES,
    HTTP_PAYLOAD_TOO_LARGE,
    "Selection too large to zip",
  );
  return assets;
}

async function streamZip(
  assets: MediaAsset[],
  result: HTTPResult,
): Promise<void> {
  const stream = result.getWriteStream(ZIP_CONTENT_TYPE, HTTP_OK);
  const zip = new ZipWriter((chunk) => stream.write(chunk));
  const taken = new Set<string>();
  try {
    for (const asset of assets) {
      const bytes = await downloadStorageBytes(asset.storageKey, asset.storage);
      zip.addFile(uniqueEntryName(asset.name, taken), bytes, asset.updatedAt);
    }
    zip.finish();
  } finally {
    stream.end();
  }
}

export class MediaBulkController extends MediaApiController {
  @Post("/assets/bulk/move")
  async bulkMove(@JSONBody() body: unknown) {
    const { ids, folderId } = assertValidation(body, (v) =>
      bulkMoveSchema.parse(v),
    );
    const context = await this.resolveContext();
    return applyToEach(context, ids, (ctx, asset) =>
      moveAsset(ctx, asset, folderId),
    );
  }

  @Post("/assets/bulk/visibility")
  async bulkVisibility(@JSONBody() body: unknown) {
    const { ids, visibility } = assertValidation(body, (v) =>
      bulkVisibilitySchema.parse(v),
    );
    const context = await this.resolveContext();
    return applyToEach(context, ids, (ctx, asset) =>
      setAssetVisibility(ctx, asset, visibility),
    );
  }

  @Post("/assets/bulk/delete")
  async bulkDelete(@JSONBody() body: unknown) {
    const { ids } = assertValidation(body, (v) => bulkIdsSchema.parse(v));
    const context = await this.resolveContext();
    return applyToEach(context, ids, removeAsset);
  }

  @Post("/assets/zip")
  async zip(@JSONBody() body: unknown) {
    const { ids } = assertValidation(body, (v) => bulkIdsSchema.parse(v));
    const context = await this.resolveContext();
    const assets = await loadZipAssets(context, ids);
    const result = new HTTPResult(HTTP_OK);
    result.addHeader(
      "Content-Disposition",
      `attachment; filename="${ZIP_FILENAME}"`,
    );
    streamZip(assets, result).catch((error: unknown) =>
      Logging.Error("Failed to stream a media zip", error),
    );
    return result;
  }
}
