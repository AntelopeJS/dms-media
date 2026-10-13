import { z } from "zod";
import { ASSET_TYPE_GROUPS } from "../library/type-groups";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;
const MAX_SEARCH_TERM_LENGTH = 200;
const MAX_BULK_ITEMS = 500;
const MAX_BATCH_ID_LENGTH = 255;
const MAX_FAILURE_NAME_LENGTH = 255;
const MAX_FAILURE_REASON_LENGTH = 500;
const MAX_REPORTED_FAILURES = 50;

export const ASSET_SORT_KEYS = ["name", "date", "size", "type"] as const;
export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export const MODIFIED_WINDOWS = ["any", "7d", "30d", "year"] as const;
export const VISIBILITY_FILTERS = ["any", "public", "private"] as const;
export const ORIENTATION_FILTERS = [
  "any",
  "landscape",
  "portrait",
  "square",
] as const;
export const SMART_VIEWS = [
  "recent",
  "starred",
  "missing-alt",
  "largest",
  "public",
] as const;

export type AssetSortKey = (typeof ASSET_SORT_KEYS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];
export type ModifiedWindow = (typeof MODIFIED_WINDOWS)[number];
export type VisibilityFilter = (typeof VISIBILITY_FILTERS)[number];
export type OrientationFilter = (typeof ORIENTATION_FILTERS)[number];
export type SmartView = (typeof SMART_VIEWS)[number];

const pageSchema = {
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  sort: z.enum(ASSET_SORT_KEYS).default("name"),
  direction: z.enum(SORT_DIRECTIONS).default("asc"),
  type: z.enum(ASSET_TYPE_GROUPS).optional(),
};

const filterSchema = {
  visibility: z.enum(VISIBILITY_FILTERS).default("any"),
  modified: z.enum(MODIFIED_WINDOWS).default("any"),
  orientation: z.enum(ORIENTATION_FILTERS).default("any"),
};

const scopeSchema = { folderId: z.string().min(1).optional() };

export const listingQuerySchema = z.object({
  ...pageSchema,
  ...filterSchema,
  ...scopeSchema,
});

export type ListingQuery = z.infer<typeof listingQuerySchema>;

/** The paging, sort and type part of a listing query. */
export type PageQuery = Pick<
  ListingQuery,
  "offset" | "limit" | "sort" | "direction" | "type"
>;

/** The facets narrowing a listing. */
export interface AssetFilterQuery {
  visibility: VisibilityFilter;
  modified: ModifiedWindow;
  orientation: OrientationFilter;
}

export const smartViewSchema = z.enum(SMART_VIEWS);

export const searchQuerySchema = z.object({
  ...pageSchema,
  ...filterSchema,
  ...scopeSchema,
  q: z.string().trim().max(MAX_SEARCH_TERM_LENGTH).default(""),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

const idsSchema = z.array(z.string().min(1)).min(1).max(MAX_BULK_ITEMS);

export const bulkIdsSchema = z.object({ ids: idsSchema });

export const bulkMoveSchema = z.object({
  ids: idsSchema,
  folderId: z.string().min(1),
});

export const bulkVisibilitySchema = z.object({
  ids: idsSchema,
  visibility: z.enum(["inherit", "private", "public"]),
});

export const favoriteSchema = z.object({
  kind: z.enum(["asset", "folder"]),
  targetId: z.string().min(1),
  starred: z.boolean(),
});

export const batchSummarySchema = z.object({
  batchId: z.string().min(1).max(MAX_BATCH_ID_LENGTH),
  folderId: z.string().min(1),
  total: z.number().int().min(0),
  uploaded: z.number().int().min(0),
  failed: z.number().int().min(0),
  size: z.number().min(0),
  failures: z
    .array(
      z.object({
        name: z.string().max(MAX_FAILURE_NAME_LENGTH),
        reason: z.string().max(MAX_FAILURE_REASON_LENGTH).optional(),
      }),
    )
    .max(MAX_REPORTED_FAILURES)
    .optional(),
});

export const starterFoldersSchema = z.object({
  folders: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(MAX_BATCH_ID_LENGTH),
        visibility: z.enum(["private", "public"]),
      }),
    )
    .min(1)
    .max(8),
});
