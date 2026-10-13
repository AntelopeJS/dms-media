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
import { loadAssetsInFolders } from "./listing";
import { storedSize } from "./overview";
import { isDescribableImage } from "./type-groups";
import { loadUploadHistoryEvents } from "./upload-history";

const TEXTS = "$dms_media.readout";
const DEFAULT_LANGUAGE = "en";
const BYTES_PER_UNIT = 1000;
const BYTE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"];
const SINGLE_DIGIT_BELOW = 10;
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
    const version = (manifest as Record<string, unknown>).version;
    return typeof version === "string" ? version : undefined;
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
  let value = Math.max(bytes, 0);
  let unit = 0;
  while (value >= BYTES_PER_UNIT && unit < BYTE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unit += 1;
  }
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit: BYTE_UNITS[unit],
    unitDisplay: "short",
    maximumFractionDigits: unit > 0 && value < SINGLE_DIGIT_BELOW ? 1 : 0,
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
