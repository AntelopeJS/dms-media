import { Query } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { type MediaAsset, MediaAssetModel, type MediaFolder } from "../../db";
import { setStarred } from "../../library/favorites";
import { assetContent, computeFolderStats } from "../../library/folder-stats";
import { countByTypeGroup, loadAssetsInFolders } from "../../library/listing";
import { matchAsset, searchFolders, searchWords } from "../../library/search";
import {
  isDescribableImage,
  resolveTypeGroup,
} from "../../library/type-groups";
import { MediaLibraryController } from "../../routes/media/library";
import type { FolderVisibility } from "../../types";
import {
  listingQuerySchema,
  searchQuerySchema,
  type AssetSortKey,
  type SmartView,
} from "../../validation/library.schema";
import { folder } from "../unit/library/fixtures";
import { patchMethod } from "../helpers/prototype";

const TENANT = "library-query-a";
const USER = "library-query-user";
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const SAME_TIME = new Date(NOW - 3 * DAY);
const RECENT_VIEW_LIMIT = 200;
const BULK_FOLDER_COUNT = 120;

const BULK_FOLDERS = Array.from({ length: BULK_FOLDER_COUNT }, (_, index) =>
  folder(`bulk-${String(index).padStart(3, "0")}`, undefined, [], {
    name: `Bulk ${index}`,
    visibility: "public",
  }),
);

const FOLDERS: MediaFolder[] = [
  folder("root", undefined, [], { name: "Racine Été", visibility: "public" }),
  folder("child", "root", ["root"], {
    name: "Produits",
    visibility: "private",
  }),
  folder("side", undefined, [], { name: "Side", visibility: "private" }),
  folder("hidden", undefined, [], { name: "Hidden", visibility: "public" }),
  folder("b-ties", undefined, [], { name: "Ties B", visibility: "private" }),
  folder("a-ties", undefined, [], { name: "Ties A", visibility: "private" }),
  ...BULK_FOLDERS,
];
const READABLE = [
  "root",
  "child",
  "side",
  "b-ties",
  "a-ties",
  ...BULK_FOLDERS.map((entry) => entry._id),
];

let sequence = 0;
function row(folderId: string, fields: Partial<MediaAsset>): MediaAsset {
  sequence += 1;
  const id = `asset-${(97 * sequence) % 1000}`;
  return {
    _id: id,
    folderId,
    name: `${id}.png`,
    mimetype: "image/png",
    size: 100,
    storageKey: `library-query/${id}`,
    visibility: "inherit",
    mediaRevision: `revision-${id}`,
    json_retiredFiles: "[]",
    createdBy: USER,
    createdAt: SAME_TIME,
    updatedAt: SAME_TIME,
    ...fields,
  };
}

const ROWS: MediaAsset[] = [
  row("root", { name: "Photo 10.png", width: 400, height: 200 }),
  row("root", { name: "photo 2.png", width: 200, height: 400, alt: "" }),
  row("root", { name: "Photo 2.png", width: 300, height: 300, alt: "  " }),
  row("root", { name: "Été à Liège.jpg", mimetype: "IMAGE/JPEG", alt: " " }),
  row("root", { name: "logo.svg", mimetype: "image/svg+xml", alt: "Logo" }),
  row("root", { name: "deck.pdf", mimetype: "application/pdf", size: 50 }),
  row("root", {
    name: "sheet.csv",
    mimetype: "text/csv",
    visibility: "private",
  }),
  row("root", { name: "clip.mp4", mimetype: "video/mp4", size: 900 }),
  row("root", {
    name: "blob.bin",
    mimetype: "application/x-unknown",
    updatedAt: new Date("2020-01-01"),
    createdAt: new Date("2020-01-01"),
  }),
  row("root", { name: "zero.png", width: 0, height: 0 }),
  row("root", { name: "gone.png", isDeleting: true }),
  row("child", { name: "photo 14.png", visibility: "public", alt: "chêne" }),
  row("child", { name: "photo 01.png", size: 900, width: 10, height: 10 }),
  row("child", {
    name: "Oak desk.png",
    alt: "produits",
    updatedAt: new Date(NOW - DAY),
    createdAt: new Date(NOW - DAY),
  }),
  row("child", { name: "a.PNG", mimetype: "Image/Png", size: 50 }),
  row("side", { name: "side 1.png", visibility: "public", size: 900 }),
  row("side", { name: "side 2.png", createdAt: new Date(NOW - 2 * DAY) }),
  row("hidden", { name: "hidden photo.png" }),
];

const TIE_ROW_COUNT = 400;
const STARRED_TIE_EVERY = 20;
const STARRED_ROW_INDEXES = [1, 11, 15];

const TIE_ROWS = Array.from({ length: TIE_ROW_COUNT }, (_, index) =>
  row(index % 2 === 0 ? "b-ties" : "a-ties", { name: "same.png" }),
);
const BULK_ROWS = BULK_FOLDERS.map((entry) =>
  row(entry._id, { name: `bulk ${entry.name}.png` }),
);
const ALL_ROWS = [...ROWS, ...TIE_ROWS, ...BULK_ROWS];

const STARRED = new Set([
  ...ROWS.filter((_, index) => STARRED_ROW_INDEXES.includes(index)).map(
    (entry) => entry._id,
  ),
  ...TIE_ROWS.filter((_, index) => index % STARRED_TIE_EVERY === 0).map(
    (entry) => entry._id,
  ),
  ...BULK_ROWS.map((entry) => entry._id),
]);

function visibilityOf(asset: MediaAsset): FolderVisibility {
  if (asset.visibility !== "inherit") return asset.visibility;
  return (
    FOLDERS.find((entry) => entry._id === asset.folderId)?.visibility ??
    "private"
  );
}

const COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
type Comparator = (left: MediaAsset, right: MediaAsset) => number;
const OLD_COMPARATORS: Record<AssetSortKey, Comparator> = {
  name: (left, right) => COLLATOR.compare(left.name, right.name),
  date: (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  size: (left, right) => left.size - right.size,
  type: (left, right) =>
    COLLATOR.compare(left.mimetype, right.mimetype) ||
    COLLATOR.compare(left.name, right.name),
};

function orientationMatches(
  asset: MediaAsset,
  orientation: "landscape" | "portrait" | "square",
): boolean {
  const { width, height } = asset;
  if (!width || !height) return false;
  return {
    landscape: width > height,
    portrait: width < height,
    square: width === height,
  }[orientation];
}
const VIEW_DEFAULT_SORTS = new Map<
  SmartView,
  { sort: AssetSortKey; direction: "asc" | "desc" }
>([
  ["recent", { sort: "date", direction: "desc" }],
  ["largest", { sort: "size", direction: "desc" }],
]);

type Params = Record<string, string>;

/** The answer the routes gave before the query pushdown: every row loaded, then filtered, sorted and paged in JS. */
async function oldAnswer(
  model: MediaAssetModel,
  route:
    | { kind: "folder"; folderId: string }
    | { kind: "view"; view: SmartView }
    | { kind: "search" },
  params: Params,
) {
  const query = listingQuerySchema.parse(params);
  const term = route.kind === "search" ? searchQuerySchema.parse(params).q : "";
  const { folderId } = query;
  const scope =
    route.kind === "folder"
      ? [route.folderId]
      : folderId
        ? [
            folderId,
            ...FOLDERS.filter((entry) => entry.path.includes(folderId)).map(
              (entry) => entry._id,
            ),
          ].filter((id) => READABLE.includes(id))
        : READABLE;
  const assets = await loadAssetsInFolders(model, scope);
  const since = {
    any: undefined,
    "7d": new Date(NOW - 7 * DAY),
    "30d": new Date(NOW - 30 * DAY),
    year: new Date(new Date(NOW).getFullYear(), 0, 1),
  }[query.modified];
  const filtered = assets.filter(
    (asset) =>
      (!since || asset.updatedAt >= since) &&
      (query.visibility === "any" ||
        visibilityOf(asset) === query.visibility) &&
      (query.orientation === "any" ||
        orientationMatches(asset, query.orientation)),
  );
  let matching = filtered;
  const matchedOn = new Map<string, string>();
  let sortQuery = query;
  if (route.kind === "view") {
    matching = {
      recent: () =>
        [...filtered]
          .sort(
            (left, right) =>
              right.createdAt.getTime() - left.createdAt.getTime(),
          )
          .slice(0, RECENT_VIEW_LIMIT),
      starred: () => filtered.filter((asset) => STARRED.has(asset._id)),
      "missing-alt": () =>
        filtered.filter(
          (asset) => isDescribableImage(asset.mimetype) && !asset.alt?.trim(),
        ),
      largest: () => filtered,
      public: () =>
        filtered.filter((asset) => visibilityOf(asset) === "public"),
    }[route.view]();
    const defaultSort = VIEW_DEFAULT_SORTS.get(route.view);
    if (defaultSort && !("sort" in params))
      sortQuery = { ...query, ...defaultSort };
  }
  if (route.kind === "search") {
    const words = searchWords(term);
    matching = filtered.filter((asset) => {
      const parent = FOLDERS.find((entry) => entry._id === asset.folderId);
      if (!parent) throw new Error(`no folder ${asset.folderId}`);
      const path = [...parent.path, parent._id]
        .map((id) => FOLDERS.find((entry) => entry._id === id)?.name ?? "")
        .join(" ");
      const match = matchAsset(asset, words, path);
      if (match) matchedOn.set(asset._id, match);
      return match !== undefined;
    });
  }
  const typed = sortQuery.type
    ? matching.filter(
        (asset) => resolveTypeGroup(asset.mimetype) === sortQuery.type,
      )
    : matching;
  const factor = sortQuery.direction === "asc" ? 1 : -1;
  const sorted = [...typed].sort(
    (left, right) => OLD_COMPARATORS[sortQuery.sort](left, right) * factor,
  );
  const answer = {
    assets: sorted
      .slice(sortQuery.offset, sortQuery.offset + sortQuery.limit)
      .map((asset) => ({ id: asset._id, matchedOn: matchedOn.get(asset._id) })),
    total: typed.length,
    facets: { all: matching.length, ...countByTypeGroup(matching) },
  };
  if (route.kind === "folder") return answer;
  const shown =
    route.kind === "search"
      ? searchFolders(
          FOLDERS.filter((entry) => scope.includes(entry._id)),
          term,
        )
      : [];
  const stats = computeFolderStats(FOLDERS, assets.map(assetContent));
  return {
    ...answer,
    folders: shown.map((entry) => ({
      id: entry._id,
      fileCount: stats.get(entry._id)?.fileCount ?? 0,
      size: stats.get(entry._id)?.size ?? 0,
    })),
  };
}

interface RouteAnswer {
  assets: { id: string; matchedOn?: string }[];
  total: number;
  facets: object;
  folders?: { id: string; fileCount: number; size: number }[];
}

/** The parts of a route answer the pushdown could change. */
function comparable(answer: RouteAnswer) {
  const page = {
    assets: answer.assets.map((asset) => ({
      id: asset.id,
      matchedOn: asset.matchedOn,
    })),
    total: answer.total,
    facets: answer.facets,
  };
  if (!answer.folders) return page;
  const folders = answer.folders.map((entry) => ({
    id: entry.id,
    fileCount: entry.fileCount,
    size: entry.size,
  }));
  return { ...page, folders };
}

function testContext(model: MediaAssetModel) {
  return {
    tenantId: TENANT,
    user: { _id: USER },
    assetModel: model,
    folders: FOLDERS,
    foldersById: new Map(FOLDERS.map((entry) => [entry._id, entry])),
    access: {
      readable: new Set(READABLE),
      writable: new Set<string>(),
      manageable: new Set<string>(),
      shells: new Set<string>(),
    },
  };
}

function controllerFor(
  context: ReturnType<typeof testContext>,
  params: Params,
): MediaLibraryController {
  const controller = new MediaLibraryController();
  Object.defineProperty(controller, "resolveContext", {
    value: async () => context,
  });
  Object.defineProperty(controller, "ctx", {
    value: { url: new URL(`http://test/?${new URLSearchParams(params)}`) },
  });
  return controller;
}

const PARAM_CASES: Params[] = [
  {},
  { sort: "name", direction: "desc" },
  { sort: "date" },
  { sort: "date", direction: "desc" },
  { sort: "size" },
  { sort: "size", direction: "desc" },
  { sort: "type" },
  { sort: "type", direction: "desc" },
  { type: "image" },
  { type: "vector", sort: "size" },
  { type: "pdf" },
  { type: "other" },
  { type: "audio" },
  { visibility: "public" },
  { visibility: "private", sort: "date" },
  { modified: "7d" },
  { modified: "year", sort: "size" },
  { orientation: "landscape" },
  { orientation: "portrait" },
  { orientation: "square", sort: "size" },
  { offset: "2", limit: "3", sort: "size" },
  { offset: "3", limit: "2", sort: "date", direction: "desc" },
  { offset: "1", limit: "4", sort: "name", type: "image" },
  { folderId: "root" },
  { folderId: "child", sort: "size", direction: "desc" },
];

describe("[integration] library listing in the database query", () => {
  let model: MediaAssetModel;
  let context: ReturnType<typeof testContext>;

  before(async function () {
    this.timeout(30_000);
    model = GetModel(MediaAssetModel, TENANT);
    await model.table.insert(ALL_ROWS).run();
    for (const id of STARRED)
      await setStarred({ tenantId: TENANT, userId: USER }, "asset", id, true);
    context = testContext(model);
  });

  after(async () => {
    await model.table.delete().run();
    for (const id of STARRED)
      await setStarred({ tenantId: TENANT, userId: USER }, "asset", id, false);
  });

  it("answers a folder page as the JS pipeline did, order and ties included", async function () {
    this.timeout(60_000);
    for (const folderId of ["root", "child", "side", "a-ties", "b-ties"])
      for (const params of PARAM_CASES) {
        const answer = await controllerFor(context, params).listAssets(
          folderId,
        );
        expect(
          comparable(answer),
          `${folderId} ${JSON.stringify(params)}`,
        ).to.deep.equal(
          await oldAnswer(model, { kind: "folder", folderId }, params),
        );
      }
  });

  it("answers every smart view as the JS pipeline did", async function () {
    this.timeout(60_000);
    for (const view of [
      "recent",
      "starred",
      "missing-alt",
      "largest",
      "public",
    ] as const)
      for (const params of PARAM_CASES) {
        const answer = await controllerFor(context, params).smartView(view);
        expect(
          comparable(answer),
          `${view} ${JSON.stringify(params)}`,
        ).to.deep.equal(await oldAnswer(model, { kind: "view", view }, params));
      }
  });

  it("answers a search as the JS pipeline did, accents and folder names included", async function () {
    this.timeout(60_000);
    for (const q of [
      "photo",
      "PHOTO 2",
      "liege",
      "chene",
      "produits",
      "produits oak",
      "racine ete photo",
      "absent",
    ])
      for (const params of PARAM_CASES) {
        const withTerm = { ...params, q };
        const answer = await controllerFor(context, withTerm).search();
        expect(
          comparable(answer),
          `${q} ${JSON.stringify(params)}`,
        ).to.deep.equal(await oldAnswer(model, { kind: "search" }, withTerm));
      }
  });

  it("reads whole rows only for the page it answers", async () => {
    let wholeRows = 0;
    const restore = patchMethod<Query<unknown>, "run">(
      Query.prototype,
      "run",
      (run) =>
        async function (this: Query<unknown>) {
          const result = await run.call(this);
          const stages = this.stages.map((stage) => stage.stage);
          if (Array.isArray(result) && !stages.includes("pluck"))
            wholeRows += result.filter(
              (entry) => "storageKey" in Object(entry),
            ).length;
          return result;
        },
    );
    try {
      const answer = await controllerFor(context, { limit: "2" }).listAssets(
        "root",
      );
      expect(answer.total).to.equal(10);
      expect(wholeRows).to.equal(2);
    } finally {
      restore();
    }
  });
});
