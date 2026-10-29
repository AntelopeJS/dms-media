import { expect } from "chai";
import { addAssetBinding, removeAssetBinding } from "../../../bindings";
import { filterAssets } from "../../../library/asset-filters";
import { bindingAccepts } from "../../../library/binding-labels";
import { computeFolderStats } from "../../../library/folder-stats";
import {
  matchAsset,
  normalizeSearchText,
  searchAssets,
  searchFolders,
  searchWords,
} from "../../../library/search";
import type { AssetFilterQuery } from "../../../validation/library.schema";
import { asset, folder } from "./fixtures";

const NOW = new Date("2026-06-01");
const ANY_FILTER: AssetFilterQuery = {
  visibility: "any",
  modified: "any",
  orientation: "any",
};

function search(q: string, folderPath = "") {
  return searchAssets(assets, {
    query: { ...ANY_FILTER, q },
    now: NOW,
    visibilityOf: () => "private",
    folderPathOf: () => folderPath,
  }).map((hit) => hit.asset._id);
}

const assets = [
  asset("summer", { name: "Été à Liège – vacances (1).jpg" }),
  asset("photo-14", { name: "photo-14.png" }),
  asset("photo-01", { name: "photo-01.png" }),
  asset("desk", { name: "desk.jpg", alt: "Chêne clair" }),
];

describe("[unit] library/search — accent-free, multi-word search", () => {
  it("normalizes accents, case and punctuation", () => {
    expect(normalizeSearchText("Été à Liège – vacances (1).jpg")).to.equal(
      "ete a liege vacances 1 jpg",
    );
    expect(searchWords("  PHOTO-01 ")).to.deep.equal(["photo", "01"]);
    expect(searchWords(" – ")).to.deep.equal([]);
  });

  it("finds a name typed without its accents", () => {
    expect(search("liege")).to.deep.equal(["summer"]);
    expect(search("ete")).to.deep.equal(["summer"]);
    expect(search("ÉTÉ")).to.deep.equal(["summer"]);
  });

  it("requires every word, in any order", () => {
    expect(search("vacances liège")).to.deep.equal(["summer"]);
    expect(search("liege hiver")).to.deep.equal([]);
    expect(search("photo 14")).to.deep.equal(["photo-14"]);
    expect(search("photo 01")).to.deep.equal(["photo-01"]);
  });

  it("matches alt text without accents and says so", () => {
    expect(matchAsset(assets[3]!, searchWords("chene"))).to.equal("alt");
    expect(matchAsset(assets[0]!, searchWords("liege"))).to.equal("name");
  });

  it("lets a folder name narrow a search, never list a folder alone", () => {
    expect(search("produits photo 14", "Produits")).to.deep.equal(["photo-14"]);
    expect(search("produits", "Produits")).to.deep.equal([]);
  });

  it("matches folder names without accents", () => {
    const folders = [folder("Été 2026"), folder("Hiver")];
    expect(
      searchFolders(folders, "ete").map((entry) => entry._id),
    ).to.deep.equal(["Été 2026"]);
  });
});

describe("[unit] library — listing facets and folder counts", () => {
  const candidates = [
    asset("wide", { width: 400, height: 200 }),
    asset("tall", { width: 200, height: 400 }),
    asset("even", { width: 300, height: 300 }),
    asset("doc", { mimetype: "application/pdf" }),
  ];

  function keep(orientation: AssetFilterQuery["orientation"]): string[] {
    return filterAssets(candidates, {
      query: { ...ANY_FILTER, orientation },
      now: NOW,
      visibilityOf: () => "private",
    }).map((entry) => entry._id);
  }

  it("filters on orientation and leaves files without size out", () => {
    expect(keep("landscape")).to.deep.equal(["wide"]);
    expect(keep("portrait")).to.deep.equal(["tall"]);
    expect(keep("square")).to.deep.equal(["even"]);
    expect(keep("any")).to.have.length(4);
  });

  it("filters on visibility and modification date", () => {
    const kept = filterAssets(
      [
        asset("old", { updatedAt: new Date("2020-01-01") }),
        asset("fresh", { updatedAt: new Date("2026-05-30") }),
      ],
      {
        query: { ...ANY_FILTER, modified: "7d", visibility: "public" },
        now: NOW,
        visibilityOf: (entry) => (entry._id === "fresh" ? "public" : "private"),
      },
    );
    expect(kept.map((entry) => entry._id)).to.deep.equal(["fresh"]);
  });

  it("keeps direct and recursive counts apart", () => {
    const folders = [folder("demo"), folder("covers", "demo", ["demo"])];
    const stats = computeFolderStats(folders, [
      asset("a", { folderId: "demo", size: 10 }),
      asset("b", { folderId: "covers", size: 20 }),
      asset("c", { folderId: "covers", size: 30 }),
    ]);
    expect(stats.get("demo")).to.include({
      fileCount: 3,
      directFileCount: 1,
      size: 60,
    });
  });
});

describe("[unit] library/binding-labels — what a linked folder accepts", () => {
  const RESTRICTED = "facets.test.restricted";
  const OPEN = "facets.test.open";

  before(() => {
    addAssetBinding(RESTRICTED, {
      id: RESTRICTED,
      field: { mimetypes: ["image/*"] },
    });
    addAssetBinding(OPEN, { id: OPEN, field: { mimetypes: [] } });
  });

  after(() => {
    removeAssetBinding(RESTRICTED);
    removeAssetBinding(OPEN);
  });

  it("reads the field mimetypes of the binding, null otherwise", () => {
    expect(bindingAccepts(RESTRICTED)).to.deep.equal(["image/*"]);
    expect(bindingAccepts(OPEN)).to.equal(null);
    expect(bindingAccepts("facets.test.unknown")).to.equal(null);
    expect(bindingAccepts(undefined)).to.equal(null);
  });
});
