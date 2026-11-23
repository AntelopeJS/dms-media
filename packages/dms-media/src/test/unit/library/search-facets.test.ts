import { expect } from "chai";
import { addAssetBinding, removeAssetBinding } from "../../../bindings";
import { bindingAccepts } from "../../../library/binding-labels";
import {
  assetContent,
  computeFolderStats,
} from "../../../library/folder-stats";
import {
  matchAsset,
  normalizeSearchText,
  searchAssets,
  searchFolders,
  searchWords,
} from "../../../library/search";
import { asset, folder } from "./fixtures";

function search(q: string, folderPath = "") {
  return searchAssets(assets, q, () => folderPath).map((hit) => hit.asset._id);
}

const summer = asset("summer", { name: "Été à Liège – vacances (1).jpg" });
const desk = asset("desk", { name: "desk.jpg", alt: "Chêne clair" });
const assets = [
  summer,
  asset("photo-14", { name: "photo-14.png" }),
  asset("photo-01", { name: "photo-01.png" }),
  desk,
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
    expect(matchAsset(desk, searchWords("chene"))).to.equal("alt");
    expect(matchAsset(summer, searchWords("liege"))).to.equal("name");
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

describe("[unit] library — folder counts", () => {
  it("keeps direct and recursive counts apart", () => {
    const folders = [folder("demo"), folder("covers", "demo", ["demo"])];
    const stats = computeFolderStats(
      folders,
      [
        asset("a", { folderId: "demo", size: 10 }),
        asset("b", { folderId: "covers", size: 20 }),
        asset("c", { folderId: "covers", size: 30 }),
      ].map(assetContent),
    );
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
