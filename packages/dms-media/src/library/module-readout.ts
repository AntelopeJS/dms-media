import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type {
  ModuleCatalogContext,
  ModuleReadoutLine,
  ModuleStatus,
} from "@antelopejs/interface-dms/page";
import { MediaAssetModel, MediaFolderModel } from "../db";
import { countFailedUploads } from "./batches";
import { type ByteUnit, scaleBytes } from "./composed-text";
import { loadAssetsInFolders } from "./listing";
import { storedSize } from "./overview";
import { isDescribableImage } from "./type-groups";
import { loadUploadHistoryEvents } from "./upload-history";
import { isObject, isString } from "../guards";

const TEXTS = "$dms_media.readout";
const DEFAULT_LANGUAGE = "en";
const INTL_BYTE_UNITS: Record<ByteUnit, string> = {
  b: "byte",
  kb: "kilobyte",
  mb: "megabyte",
  gb: "gigabyte",
  tb: "terabyte",
};
const PACKAGE_MANIFEST = join(__dirname, "..", "..", "package.json");

interface LibraryHealth {
  files: number;
  size: number;
  failedToday: number;
  missingAlt: number;
}

/** The module's version, read from its manifest; none when it cannot be read. */
export function readModuleVersion(): string | undefined {
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(PACKAGE_MANIFEST, "utf8"),
    );
    const version =
      isObject(manifest) && "version" in manifest
        ? manifest.version
        : undefined;
    return isString(version) ? version : undefined;
  } catch {
    return undefined;
  }
}

/** The failed-uploads count of the overview, over every folder that still exists. */
async function countLibraryFailures(
  tenantId: string,
  folderIds: string[],
): Promise<number> {
  const now = new Date();
  const events = await loadUploadHistoryEvents(
    tenantId,
    new Set(folderIds),
    now,
  );
  return countFailedUploads(events, now);
}

async function readLibraryHealth(tenantId: string): Promise<LibraryHealth> {
  const folders = await GetModel(MediaFolderModel, tenantId).getAll();
  const assets = await loadAssetsInFolders(
    GetModel(MediaAssetModel, tenantId),
    folders.map((folder) => folder._id),
  );
  return {
    files: assets.length,
    size: assets.reduce((total, asset) => total + storedSize(asset), 0),
    failedToday: await countLibraryFailures(
      tenantId,
      folders.map((folder) => folder._id),
    ),
    missingAlt: assets.filter(
      (asset) => isDescribableImage(asset.mimetype) && !asset.alt?.trim(),
    ).length,
  };
}

/** A byte size in the reader's language, units included ("24 MB", "24 Mo"). */
function formatBytes(bytes: number, language: string): string {
  const { value, unit } = scaleBytes(bytes);
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit: INTL_BYTE_UNITS[unit],
    unitDisplay: "short",
  }).format(value);
}

function readerLanguage(context: ModuleCatalogContext): string {
  return context.user?.language || DEFAULT_LANGUAGE;
}

function healthLine(health: LibraryHealth): ModuleReadoutLine {
  if (health.failedToday > 0)
    return { text: `${TEXTS}.failed_today`, tone: "error" };
  if (health.missingAlt > 0)
    return { text: `${TEXTS}.missing_alt`, tone: "warning" };
  return { text: `${TEXTS}.healthy`, tone: "success" };
}

/**
 * Two lines on the modules catalog: how big the library is, then what needs
 * a look first. The catalog writes no values into its texts, so the figures
 * are written here in the reader's language.
 */
export async function mediaReadout(
  context: ModuleCatalogContext,
): Promise<ModuleReadoutLine[]> {
  const health = await readLibraryHealth(context.tenantId);
  const language = readerLanguage(context);
  const files = new Intl.NumberFormat(language).format(health.files);
  return [
    {
      text: `${files} · ${formatBytes(health.size, language)}`,
      tone: "info",
    },
    healthLine(health),
  ];
}

/** `attention` while uploads failed today, so the owner sees it from the catalog. */
export async function mediaStatus(
  context: ModuleCatalogContext,
): Promise<ModuleStatus> {
  const folders = await GetModel(MediaFolderModel, context.tenantId).getAll();
  const failed = await countLibraryFailures(
    context.tenantId,
    folders.map((folder) => folder._id),
  );
  return failed > 0 ? "attention" : "live";
}
