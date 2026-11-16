import { Query } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { type MediaAsset, MediaAssetModel, type MediaFolder } from "../../db";
import {
  countLiveAssets,
  countPublicFiles,
  countRenderedSizes,
  LIBRARY_SUBSETS,
  loadFolderCounts,
  loadMimetypeTotals,
  subsetRows,
  sumFiles,
  sumLibraryTotals,
  sumSize,
  totalsByTypeGroup,
} from "../../library/asset-totals";
import { computeFolderStats, assetContent } from "../../library/folder-stats";
import {
  loadAssetsInFolders,
  loadNamesContaining,
  loadNewestAssets,
} from "../../library/listing";
import { loadExampleImage } from "../../library/presets-page";
import {
  isDescribableImage,
  resolveTypeGroup,
} from "../../library/type-groups";
import { entryStem, uniqueEntryName } from "../../library/zip";
import { copyStem, suggestFreeNames } from "../../upload-names";
import { resolveEffectiveVisibility } from "../../routes/media/dto";
import { parseDerivatives } from "../../routes/media/storage-keys";
import { folder } from "../unit/library/fixtures";
import { patchMethod } from "../helpers/prototype";

const TENANT = "library-totals-query";
const MB = 1000 * 1000;
const SINCE = new Date("2026-05-02T12:00:00Z");
const RECENT = 6;
const EXAMPLE_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const FOLDERS: MediaFolder[] = [
  folder("root", undefined, [], { visibility: "public" }),
  folder("child", "root", ["root"]),
  folder("grandchild", "child", ["root", "child"], { visibility: "public" }),
  folder("other"),
];
const FOLDERS_BY_ID = new Map(FOLDERS.map((entry) => [entry._id, entry]));
const FOLDER_IDS = FOLDERS.map((entry) => entry._id);

interface Seed {
  id: string;
  folderId: string;
  name: string;
  mimetype: string;
  size: number;
  createdAt: Date;
  visibility?: MediaAsset["visibility"];
  alt?: string;
  originalSize?: number;
  derivatives?: Record<string, string>;
  isDeleting?: boolean;
}

const SEEDS: Seed[] = [
  {
    id: "a",
    folderId: "root",
    name: "Photo.jpg",
    mimetype: "image/jpeg",
    size: 1200,
    createdAt: new Date("2026-05-30T00:00:00Z"),
    derivatives: { "thumb-1": "k/a/thumb", "hero-1": "k/a/hero" },
  },
  {
    id: "b",
    folderId: "root",
    name: "photo (2).jpg",
    mimetype: "IMAGE/PNG",
    size: 25 * MB,
    originalSize: 30 * MB,
    alt: "   ",
    visibility: "private",
    createdAt: new Date("2026-04-01T00:00:00Z"),
    derivatives: { "thumb-1": "k/b/thumb" },
  },
  {
    id: "c",
    folderId: "child",
    name: "logo.svg",
    mimetype: "image/svg+xml",
    size: 300,
    alt: " 　",
    visibility: "public",
    createdAt: new Date("2026-05-31T00:00:00Z"),
  },
  {
    id: "d",
    folderId: "child",
    name: "report.pdf",
    mimetype: "application/pdf",
    size: 21 * MB,
    createdAt: new Date("2026-05-31T00:00:00Z"),
    derivatives: { "hero-1": "k/d/thumb-1" },
  },
  {
    id: "e",
    folderId: "grandchild",
    name: "cover.webp",
    mimetype: "image/webp",
    size: 800,
    alt: " A cover ",
    createdAt: new Date("2026-05-02T12:00:00Z"),
  },
  {
    id: "f",
    folderId: "grandchild",
    name: "PHOTO.JPG",
    mimetype: "image/jpeg",
    size: 500,
    visibility: "private",
    createdAt: new Date("2026-05-29T00:00:00Z"),
  },
  {
    id: "g",
    folderId: "other",
    name: "notes.txt",
    mimetype: "text/plain",
    size: 40,
    visibility: "public",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: "h",
    folderId: "root",
    name: "photo (3).jpg",
    mimetype: "image/jpeg",
    size: 999 * MB,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    isDeleting: true,
    derivatives: { "thumb-1": "k/h/thumb" },
  },
];

function record(seed: Seed): Partial<MediaAsset> {
  return {
    _id: seed.id,
    folderId: seed.folderId,
    name: seed.name,
    mimetype: seed.mimetype,
    size: seed.size,
    alt: seed.alt,
    originalSize: seed.originalSize,
    originalKey: seed.originalSize ? `originals/${seed.id}` : undefined,
    visibility: seed.visibility ?? "inherit",
    json_derivatives: seed.derivatives ? JSON.stringify(seed.derivatives) : "",
    isDeleting: seed.isDeleting,
    storageKey: `files/${seed.id}`,
    mediaRevision: `revision-${seed.id}`,
    json_retiredFiles: "[]",
    createdBy: "totals-test",
  };
}

function isPublic(asset: MediaAsset): boolean {
  return (
    resolveEffectiveVisibility(asset, FOLDERS_BY_ID.get(asset.folderId)) ===
    "public"
  );
}

function storedSize(asset: MediaAsset): number {
  return asset.size + (asset.originalSize ?? 0);
}

function missingAlt(asset: MediaAsset): boolean {
  return isDescribableImage(asset.mimetype) && !asset.alt?.trim();
}

function sum(assets: MediaAsset[], size: (asset: MediaAsset) => number) {
  return assets.reduce((total, asset) => total + size(asset), 0);
}

/** The figures as the routes computed them before, over every loaded asset. */
function figuresInJavaScript(assets: MediaAsset[]) {
  const undescribed = assets.filter(missingAlt);
  const large = assets.filter((asset) => asset.size > 20 * MB);
  const byTypeGroup = new Map<string, { files: number; size: number }>();
  for (const asset of assets) {
    const group = resolveTypeGroup(asset.mimetype);
    const total = byTypeGroup.get(group) ?? { files: 0, size: 0 };
    byTypeGroup.set(group, {
      files: total.files + 1,
      size: total.size + storedSize(asset),
    });
  }
  return {
    totals: {
      files: assets.length,
      size: sum(assets, (asset) => asset.size),
      storedSize: sum(assets, storedSize),
      publicFiles: assets.filter(isPublic).length,
      missingAlt: undescribed.length,
      publicMissingAlt: undescribed.filter(isPublic).length,
      createdSince: assets.filter(
        (asset) => asset.createdAt.getTime() >= SINCE.getTime(),
      ).length,
      largeFiles: large.length,
      largeStoredSize: sum(large, storedSize),
    },
    byTypeGroup,
  };
}

function captureStages() {
  const stages: string[][] = [];
  const restore = patchMethod<Query<unknown>, "run">(
    Query.prototype,
    "run",
    (run) =>
      function (this: Query<unknown>) {
        stages.push(this.stages.map((stage) => stage.stage));
        return run.call(this);
      },
  );
  return { stages, restore };
}

let model: MediaAssetModel;
let assets: MediaAsset[];

function seedLibrary() {
  before(async () => {
    model = GetModel(MediaAssetModel, TENANT);
    await model.insert(SEEDS.map(record));
    for (const seed of SEEDS)
      await model.table
        .get(seed.id)
        .update({ createdAt: seed.createdAt })
        .run();
    assets = await loadAssetsInFolders(model, FOLDER_IDS);
  });

  after(async () => {
    await model.table.delete().run();
  });
}

describe("[integration] library counts and sizes in the query", () => {
  seedLibrary();

  it("seeds every figure the routes count", () => {
    expect(assets.map((asset) => asset._id).sort()).to.deep.equal([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
    ]);
    expect(assets.find((asset) => asset._id === "e")?.createdAt).to.deep.equal(
      SINCE,
    );
  });

  it("sums the same figures as the loaded assets, folder visibility resolved", async () => {
    const { stages, restore } = captureStages();
    let counts;
    try {
      counts = await loadFolderCounts(
        model,
        FOLDER_IDS,
        LIBRARY_SUBSETS,
        SINCE,
      );
    } finally {
      restore();
    }
    const expected = figuresInJavaScript(assets);
    expect(sumLibraryTotals(counts, FOLDERS_BY_ID)).to.deep.equal(
      expected.totals,
    );
    expect(stages).to.have.length(LIBRARY_SUBSETS.length + 1);
    for (const stage of stages) expect(stage).to.include("group");
    expect(
      Object.fromEntries(computeFolderStats(FOLDERS, counts.all)),
    ).to.deep.equal(
      Object.fromEntries(computeFolderStats(FOLDERS, assets.map(assetContent))),
    );
  });

  it("sums a subtree like the folder impact did", async () => {
    const subtree = ["child", "grandchild"];
    const inSubtree = assets.filter((asset) =>
      subtree.includes(asset.folderId),
    );
    const counts = await loadFolderCounts(model, subtree, [
      "ownPublic",
      "inherited",
    ]);
    expect({
      files: sumFiles(counts.all),
      size: sumSize(counts.all),
      publicFiles: countPublicFiles(
        subsetRows(counts, "ownPublic"),
        subsetRows(counts, "inherited"),
        FOLDERS_BY_ID,
      ),
    }).to.deep.equal({
      files: inSubtree.length,
      size: sum(inSubtree, (asset) => asset.size),
      publicFiles: inSubtree.filter(isPublic).length,
    });
    expect(await loadFolderCounts(model, [], ["ownPublic"])).to.deep.equal({
      all: [],
      subsets: {},
    });
  });

  it("groups stored bytes per kind of file like the storage meter did", async () => {
    const rows = await loadMimetypeTotals(model, FOLDER_IDS);
    expect(Object.fromEntries(totalsByTypeGroup(rows))).to.deep.equal(
      Object.fromEntries(figuresInJavaScript(assets).byTypeGroup),
    );
  });

  it("counts the starred files of a scope, deleting ones left out", async () => {
    const starred = ["a", "c", "h", "missing"];
    for (const scope of [FOLDER_IDS, ["child"], []]) {
      expect(await countLiveAssets(model, starred, scope)).to.equal(
        assets.filter(
          (asset) =>
            starred.includes(asset._id) && scope.includes(asset.folderId),
        ).length,
      );
    }
  });
});

describe("[integration] library rows the overview, presets and name checks read", () => {
  seedLibrary();

  it("orders the newest files like the overview did", async () => {
    const expected = [...assets]
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )
      .slice(0, RECENT);
    const newest = await loadNewestAssets(model, FOLDER_IDS, RECENT);
    expect(newest.map((asset) => asset.createdAt)).to.deep.equal(
      expected.map((asset) => asset.createdAt),
    );
    expect(new Set(newest.map((asset) => asset._id))).to.deep.equal(
      new Set(expected.map((asset) => asset._id)),
    );
  });

  it("counts each rendered size like the presets page did", async () => {
    const keys = ["thumb-1", "hero-1", "never"];
    const counts = await countRenderedSizes(model, FOLDER_IDS, keys);
    for (const key of keys)
      expect(counts.get(key), key).to.equal(
        assets.filter((asset) =>
          Object.keys(parseDerivatives(asset)).includes(key),
        ).length,
      );
  });

  it("picks the example photo the presets page picked", async () => {
    const publicFolders = FOLDERS.filter(
      (entry) => entry.visibility === "public",
    ).map((entry) => entry._id);
    const cases: [string[], string[]][] = [
      [FOLDER_IDS, publicFolders],
      [FOLDER_IDS, []],
      [["other"], publicFolders],
    ];
    for (const [scope, isPublicFolder] of cases) {
      const photos = assets
        .filter(
          (asset) =>
            scope.includes(asset.folderId) &&
            EXAMPLE_MIMETYPES.has(asset.mimetype.toLowerCase()),
        )
        .sort(
          (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
        );
      const visible = (asset: MediaAsset) =>
        asset.visibility === "public" ||
        (asset.visibility === "inherit" &&
          isPublicFolder.includes(asset.folderId));
      const expected = photos.find(visible) ?? photos[0];
      const example = await loadExampleImage(model, scope, isPublicFolder);
      expect(example?._id).to.equal(expected?._id);
    }
  });

  it("suggests the same free names from the colliding names only", async () => {
    const incoming = ["photo.jpg", "PHOTO (2).JPG", "logo.svg", "new.png"];
    for (const folderId of FOLDER_IDS) {
      const all = assets
        .filter((asset) => asset.folderId === folderId)
        .map((asset) => asset.name);
      const colliding = await loadNamesContaining(
        model,
        folderId,
        incoming.map(copyStem),
      );
      expect(suggestFreeNames(colliding, incoming)).to.deep.equal(
        suggestFreeNames(all, incoming),
      );
      for (const source of ["photo.jpg", "Photo (2).jpg", "x.png"]) {
        const fromQuery = await loadNamesContaining(model, folderId, [
          entryStem(source),
        ]);
        expect(
          uniqueEntryName(
            source,
            new Set(fromQuery.map((name) => name.toLowerCase())),
          ),
        ).to.equal(
          uniqueEntryName(
            source,
            new Set(all.map((name) => name.toLowerCase())),
          ),
        );
      }
    }
  });
});
