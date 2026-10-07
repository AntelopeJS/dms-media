import { GetModel } from "@antelopejs/interface-database-decorators";
import { Get, JSONBody, Parameter, Post } from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import type { AssetBindingConfig } from "@antelopejs/interface-dms-media";
import { buildBindingAcl, getRegisteredBindings } from "../../bindings";
import { getMediaConfig } from "../../config";
import { getLastSweep, SWEEP_DERIVATIVES_SCHEDULE } from "../../crons";
import { MediaEventModel, type MediaFolder } from "../../db";
import { folderPath } from "../../library/activity";
import { buildUploadBatches } from "../../library/batches";
import { loadAssetsInFolders } from "../../library/listing";
import { presetCacheKey } from "../../presets";
import { batchSummarySchema } from "../../validation/library.schema";
import {
  PRIVATE_READ_URL_TTL_SECONDS,
  PUBLIC_READ_URL_TTL_SECONDS,
} from "./constants";
import { MediaApiController } from "./controller";
import { type MediaRequestContext, requireFolderRight } from "./context";
import { parseDerivatives } from "./storage-keys";

const HTTP_NOT_FOUND = 404;
const EVENTS_SCANNED = 1000;

interface SourcePage {
  offset: number;
  limit: number;
}

function readSourcePage(query: Record<string, string>): SourcePage {
  const offset = Math.max(Number(query.offset ?? 0) || 0, 0);
  const limit = Math.max(Number(query.limit ?? 0) || 0, 0);
  return { offset, limit };
}

function pageRows<T>(
  rows: T[],
  page: SourcePage,
): { results: T[]; total: number } {
  const results = page.limit
    ? rows.slice(page.offset, page.offset + page.limit)
    : rows.slice(page.offset);
  return { results, total: rows.length };
}

function permissionIdsWith(
  config: AssetBindingConfig,
  right: "read" | "write" | "manage",
): string[] {
  return buildBindingAcl(config)
    .filter((entry) => entry.rights.includes(right))
    .map((entry) => entry.subject.id);
}

function bindingFolder(
  context: MediaRequestContext,
  bindingId: string,
): MediaFolder | undefined {
  return context.folders.find(
    (folder) =>
      folder.binding === bindingId &&
      (context.access.readable.has(folder._id) ||
        context.access.shells.has(folder._id)),
  );
}

export class MediaManageController extends MediaApiController {
  @Post("/upload/batches")
  async reportBatch(@JSONBody() body: unknown) {
    const summary = assertValidation(body, (v) => batchSummarySchema.parse(v));
    const context = await this.resolveContext();
    const folder = requireFolderRight(context, summary.folderId, "write");
    await this.record(context, {
      kind: "upload.batch",
      targetName: folder.name,
      folderId: folder._id,
      count: summary.uploaded,
      size: summary.size,
      details: {
        batchId: summary.batchId,
        total: summary.total,
        failed: summary.failed,
      },
    });
    return { ok: true };
  }

  @Get("/upload/batches")
  async listBatches() {
    const context = await this.resolveContext();
    const events = await GetModel(MediaEventModel, context.tenantId).listRecent(
      EVENTS_SCANNED,
    );
    const visible = events.filter(
      (event) => event.folderId && context.access.readable.has(event.folderId),
    );
    return pageRows(
      buildUploadBatches(visible, context.foldersById),
      readSourcePage(this.readQuery()),
    );
  }

  @Get("/linked")
  async listLinked() {
    const context = await this.resolveContext();
    const rows = await Promise.all(
      getRegisteredBindings().map(async (config) => {
        const folder = bindingFolder(context, config.id);
        if (!folder) return undefined;
        const files = context.access.readable.has(folder._id)
          ? (await loadAssetsInFolders(context.assetModel, [folder._id])).length
          : 0;
        return {
          _id: config.id,
          folderId: folder._id,
          folder: folder.name,
          path: folderPath(folder._id, context.foldersById),
          field: config.id,
          accepts: (config.field?.mimetypes ?? []).join(", "),
          multiple: config.field?.multiple ?? false,
          max: config.field?.max ?? null,
          uploaders: permissionIdsWith(config, "write").join(", "),
          visibility: folder.visibility,
          files,
        };
      }),
    );
    const visibleRows = rows.filter((row) => row !== undefined);
    return pageRows(visibleRows, readSourcePage(this.readQuery()));
  }

  @Get("/linked/:bindingId")
  async linkedDetail(@Parameter("bindingId", "param") bindingId: string) {
    const context = await this.resolveContext();
    const config = getRegisteredBindings().find(
      (entry) => entry.id === bindingId,
    );
    const folder = config ? bindingFolder(context, config.id) : undefined;
    assert(config && folder, HTTP_NOT_FOUND, "Linked folder not found");
    return {
      id: config.id,
      folderId: folder._id,
      folderName: folder.name,
      path: folderPath(folder._id, context.foldersById),
      createdAt: folder.createdAt,
      visibility: folder.visibility,
      field: config.field ?? {},
      read: permissionIdsWith(config, "read"),
      write: permissionIdsWith(config, "write"),
      manage: permissionIdsWith(config, "manage"),
      fromPage: Boolean(config.permissionsFromPage),
    };
  }

  @Get("/presets")
  async presets() {
    const context = await this.resolveContext();
    const assets = await loadAssetsInFolders(context.assetModel, [
      ...context.access.readable,
    ]);
    const renderedKeys = assets.flatMap((asset) =>
      Object.keys(parseDerivatives(asset)),
    );
    const sweep = getLastSweep();
    return {
      presets: [...getMediaConfig().presets.values()].map((preset) => {
        const cacheKey = presetCacheKey(preset);
        return {
          ...preset,
          cacheKey,
          rendered: renderedKeys.filter((key) => key === cacheKey).length,
          urlPattern: `/media/{asset}/${preset.id}/{filename}`,
        };
      }),
      cache: {
        schedule: SWEEP_DERIVATIVES_SCHEDULE,
        lastSweepAt: sweep?.finishedAt ?? null,
        lastSweepRemoved: sweep?.removedFiles ?? null,
        publicTtlSeconds: PUBLIC_READ_URL_TTL_SECONDS,
        privateTtlSeconds: PRIVATE_READ_URL_TTL_SECONDS,
      },
    };
  }
}
