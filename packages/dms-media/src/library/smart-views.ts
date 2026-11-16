import type { FolderVisibility } from "../types";
import type { ListingQuery, SmartView } from "../validation/library.schema";
import {
  type AssetPredicate,
  effectiveVisibilityPredicate,
  isOneOf,
} from "./asset-filters";
import { isMissingAlt } from "./asset-totals";
import type { AssetSortFields } from "./listing";

const RECENT_VIEW_LIMIT = 200;

/** What a smart view needs besides the assets: the caller's stars and each folder's visibility. */
interface SmartViewInput {
  starredAssetIds: Set<string>;
  folderVisibilities: ReadonlyMap<string, FolderVisibility>;
}

/** The conditions a smart view adds, and for `newest` the count of newest files it keeps. */
interface SmartViewQuery {
  where: AssetPredicate[];
  newest?: number;
}

type ViewSort = Pick<ListingQuery, "sort" | "direction">;

/** The order a view opens in when the caller asks for none. */
export const SMART_VIEW_DEFAULT_SORTS: Partial<Record<SmartView, ViewSort>> = {
  recent: { sort: "date", direction: "desc" },
  largest: { sort: "size", direction: "desc" },
};

/** The conditions of each smart view, run in the query. */
export const SMART_VIEWS: Record<
  SmartView,
  (input: SmartViewInput) => SmartViewQuery
> = {
  recent: () => ({ where: [], newest: RECENT_VIEW_LIMIT }),
  starred: ({ starredAssetIds }) => ({
    where: [(row) => isOneOf(row.key("_id"), starredAssetIds)],
  }),
  "missing-alt": () => ({ where: [isMissingAlt] }),
  largest: () => ({ where: [] }),
  public: ({ folderVisibilities }) => ({
    where: [effectiveVisibilityPredicate("public", folderVisibilities)],
  }),
};

/** Newest first, ties kept in input order. */
export function newestFirst<T extends AssetSortFields>(assets: T[]): T[] {
  return [...assets].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
}
