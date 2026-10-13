import type { MediaAsset } from "../db";
import type { FolderVisibility } from "../types";
import type {
  AssetFilterQuery,
  ModifiedWindow,
  OrientationFilter,
} from "../validation/library.schema";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;

type ModifiedSince = (now: Date) => Date | undefined;

const MODIFIED_SINCE: Record<ModifiedWindow, ModifiedSince> = {
  any: () => undefined,
  "7d": (now) => new Date(now.getTime() - WEEK_DAYS * MS_PER_DAY),
  "30d": (now) => new Date(now.getTime() - MONTH_DAYS * MS_PER_DAY),
  year: (now) => new Date(now.getFullYear(), 0, 1),
};

type OrientationTest = (width: number, height: number) => boolean;

const ORIENTATION_TESTS: Record<
  Exclude<OrientationFilter, "any">,
  OrientationTest
> = {
  landscape: (width, height) => width > height,
  portrait: (width, height) => width < height,
  square: (width, height) => width === height,
};

export interface AssetFilterContext {
  query: AssetFilterQuery;
  now: Date;
  visibilityOf: (asset: MediaAsset) => FolderVisibility;
}

function matchesOrientation(
  asset: MediaAsset,
  orientation: OrientationFilter,
): boolean {
  if (orientation === "any") return true;
  if (!asset.width || !asset.height) return false;
  return ORIENTATION_TESTS[orientation](asset.width, asset.height);
}

/** Keeps the assets matching the visibility, modified and orientation facets. */
export function filterAssets(
  assets: MediaAsset[],
  filter: AssetFilterContext,
): MediaAsset[] {
  const since = MODIFIED_SINCE[filter.query.modified](filter.now);
  const visibility = filter.query.visibility;
  return assets.filter(
    (asset) =>
      (!since || asset.updatedAt >= since) &&
      (visibility === "any" || filter.visibilityOf(asset) === visibility) &&
      matchesOrientation(asset, filter.query.orientation),
  );
}
