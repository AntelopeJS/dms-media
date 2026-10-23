import { Get, JSONBody, Post } from "@antelopejs/interface-api";
import { assertValidation } from "@antelopejs/interface-api-util";
import { getMediaConfig } from "../../config";
import { getLastSweep, SWEEP_DERIVATIVES_SCHEDULE } from "../../crons";
import type { MediaAsset } from "../../db";
import { buildUploadBatches, type UploadBatchRow } from "../../library/batches";
import { loadUploadHistoryEvents } from "../../library/upload-history";
import { presetsConfigSnippet } from "../../library/snippets";
import { loadAssetsInFolders } from "../../library/listing";
import {
  buildPresetCacheItems,
  pickExampleImage,
  usesDefaultPresets,
} from "../../library/presets-page";
import { type MediaPresetConfig, presetCacheKey } from "../../presets";
import { batchSummarySchema } from "../../validation/library.schema";
import {
  PRIVATE_READ_URL_TTL_SECONDS,
  PUBLIC_READ_URL_TTL_SECONDS,
} from "./constants";
import { MediaApiController } from "./controller";
import { requireFolderRight } from "./context";
import { resolveEffectiveVisibility } from "./dto";
import { parseDerivatives } from "./storage-keys";

type BatchSummary = ReturnType<typeof batchSummarySchema.parse>;

const FILTER_PREFIX = "filter_";
const FILTER_VALUE_SEPARATOR = ":";
const FILTER_LIST_SEPARATOR = ",";

interface SourcePage {
  offset: number;
  limit: number;
}

/** The `filter_<column>=<mode>:<a,b>` queries of the history table, by column. */
function readRowFilters(
  query: Record<string, string>,
): Map<string, Set<string>> {
  const filters = new Map<string, Set<string>>();
  for (const [key, raw] of Object.entries(query)) {
    if (!key.startsWith(FILTER_PREFIX) || !raw) continue;
    const value = raw.slice(raw.indexOf(FILTER_VALUE_SEPARATOR) + 1);
    filters.set(
      key.slice(FILTER_PREFIX.length),
      new Set(value.split(FILTER_LIST_SEPARATOR).filter(Boolean)),
    );
  }
  return filters;
}

function matchesFilters(
  row: UploadBatchRow,
  filters: Map<string, Set<string>>,
): boolean {
  const fields: Record<string, unknown> = { ...row };
  return [...filters].every(([column, values]) =>
    values.has(String(fields[column])),
  );
}

function batchDetails(summary: BatchSummary): Record<string, string | number> {
  const details: Record<string, string | number> = {
    batchId: summary.batchId,
    total: summary.total,
    failed: summary.failed,
  };
  if (summary.failures?.length)
    details.failures = JSON.stringify(summary.failures);
  return details;
}

interface PresetRowInput {
  preset: MediaPresetConfig;
  origin: string;
  renderedKeys: string[];
  example?: MediaAsset;
}

/**
 * A preset's card: `urlPattern` and `exampleUrl` are the absolute links a
 * website copies, while `examplePreviewUrl` stays relative so the dashboard
 * loads the preview through its own origin, which carries the member's
 * session to a private example.
 */
export function presetRow({
  preset,
  origin,
  renderedKeys,
  example,
}: PresetRowInput) {
  const cacheKey = presetCacheKey(preset);
  const examplePath = example
    ? `/media/${example._id}/${preset.id}/${encodeURIComponent(example.name)}`
    : null;
  return {
    ...preset,
    cacheKey,
    rendered: renderedKeys.filter((key) => key === cacheKey).length,
    urlPattern: `${origin}/media/{asset}/${preset.id}/{filename}`,
    exampleUrl: examplePath ? `${origin}${examplePath}` : null,
    examplePreviewUrl: examplePath,
  };
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
      details: batchDetails(summary),
    });
    return { ok: true };
  }

  @Get("/upload/batches")
  async listBatches() {
    const context = await this.resolveContext();
    const now = new Date();
    const events = await loadUploadHistoryEvents(
      context.tenantId,
      context.access.readable,
      now,
    );
    const query = this.readQuery();
    const filters = readRowFilters(query);
    const rows = buildUploadBatches(events, context.foldersById, now).filter(
      (row) => matchesFilters(row, filters),
    );
    return pageRows(rows, readSourcePage(query));
  }

  @Get("/presets/config")
  async presetsConfig() {
    await this.resolveContext();
    return {
      code: presetsConfigSnippet([...getMediaConfig().presets.values()]),
      language: "typescript",
    };
  }

  @Get("/presets/cache")
  async presetCache() {
    await this.resolveContext();
    return {
      items: buildPresetCacheItems({
        publicLinkSeconds: PUBLIC_READ_URL_TTL_SECONDS,
        privateLinkSeconds: PRIVATE_READ_URL_TTL_SECONDS,
        sweepSchedule: SWEEP_DERIVATIVES_SCHEDULE,
        lastSweep: getLastSweep(),
        now: new Date(),
      }),
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
    const example = pickExampleImage(
      assets,
      (asset) =>
        resolveEffectiveVisibility(
          asset,
          context.foldersById.get(asset.folderId),
        ) === "public",
    );
    const presets = [...getMediaConfig().presets.values()];
    const origin = await this.publicOrigin();
    const sweep = getLastSweep();
    return {
      isDefault: usesDefaultPresets(presets),
      example: example
        ? {
            id: example._id,
            name: example.name,
            width: example.width ?? null,
            height: example.height ?? null,
          }
        : null,
      presets: presets.map((preset) =>
        presetRow({
          preset,
          origin,
          renderedKeys,
          example,
        }),
      ),
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
