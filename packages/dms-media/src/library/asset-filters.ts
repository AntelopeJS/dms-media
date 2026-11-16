import { ValueProxy } from "@antelopejs/interface-database";
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

/** A condition on one asset row, run in the database query. */
export type AssetPredicate = (
  row: ValueProxy<MediaAsset>,
) => ValueProxy<boolean>;

type ModifiedSince = (now: Date) => Date | undefined;

const MODIFIED_SINCE: Record<ModifiedWindow, ModifiedSince> = {
  any: () => undefined,
  "7d": (now) => new Date(now.getTime() - WEEK_DAYS * MS_PER_DAY),
  "30d": (now) => new Date(now.getTime() - MONTH_DAYS * MS_PER_DAY),
  year: (now) => new Date(now.getFullYear(), 0, 1),
};

type Dimension = ValueProxy<number>;

const ORIENTATION_TESTS: Record<
  Exclude<OrientationFilter, "any">,
  (width: Dimension, height: Dimension) => ValueProxy<boolean>
> = {
  landscape: (width, height) => width.gt(height),
  portrait: (width, height) => width.lt(height),
  square: (width, height) => width.eq(height),
};

/** True when `value` is one of `options`, tested as one flat `$in` whatever the option count. */
export function isOneOf(
  value: ValueProxy<string>,
  options: Iterable<string>,
): ValueProxy<boolean> {
  return ValueProxy.constant([...options]).includes(value);
}

function dimension(row: ValueProxy<MediaAsset>, key: "width" | "height") {
  return row.key(key).default(0);
}

function orientationPredicate(
  orientation: Exclude<OrientationFilter, "any">,
): AssetPredicate {
  return (row) =>
    dimension(row, "width")
      .ne(0)
      .and(dimension(row, "height").ne(0))
      .and(
        ORIENTATION_TESTS[orientation](
          dimension(row, "width"),
          dimension(row, "height"),
        ),
      );
}

/** Assets whose visibility, or whose folder's when they inherit it, is `visibility`. */
export function effectiveVisibilityPredicate(
  visibility: FolderVisibility,
  folderVisibilities: ReadonlyMap<string, FolderVisibility>,
): AssetPredicate {
  const inheritingFolders = [...folderVisibilities]
    .filter(([, folderVisibility]) => folderVisibility === visibility)
    .map(([folderId]) => folderId);
  return (row) => {
    const own = row.key("visibility").eq(visibility);
    const inherited = isOneOf(row.key("folderId"), inheritingFolders);
    return own.or(row.key("visibility").eq("inherit").and(inherited));
  };
}

export interface AssetFilterContext {
  query: AssetFilterQuery;
  now: Date;
  /** The visibility of each folder in scope; an asset that inherits takes it. */
  folderVisibilities: ReadonlyMap<string, FolderVisibility>;
}

/** The conditions of the visibility, modified and orientation facets. */
export function assetFilterPredicates(
  filter: AssetFilterContext,
): AssetPredicate[] {
  const predicates: AssetPredicate[] = [];
  const since = MODIFIED_SINCE[filter.query.modified](filter.now);
  if (since) predicates.push((row) => row.key("updatedAt").ge(since));
  if (filter.query.visibility !== "any")
    predicates.push(
      effectiveVisibilityPredicate(
        filter.query.visibility,
        filter.folderVisibilities,
      ),
    );
  if (filter.query.orientation !== "any")
    predicates.push(orientationPredicate(filter.query.orientation));
  return predicates;
}
