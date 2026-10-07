import { expect } from "chai";
import { buildActivityItems } from "../../../library/activity";
import { buildUploadBatches } from "../../../library/batches";
import { computeFolderStats } from "../../../library/folder-stats";
import { createMediaTranslator, resolveLocale } from "../../../library/i18n";
import { countByTypeGroup, pageAssets } from "../../../library/listing";
import { searchAssets, searchFolders } from "../../../library/search";
import {
  isDescribableImage,
  resolveTypeGroup,
} from "../../../library/type-groups";
import { uniqueEntryName, ZipWriter } from "../../../library/zip";
import { asset, event, folder } from "./fixtures";

const ZIP_END_SIGNATURE = 0x06054b50;
const ZIP_END_RECORD_SIZE = 22;
const ZIP_ENTRY_COUNT_OFFSET = 10;

describe("[unit] library — type groups", () => {
  it("files mimetypes into the groups the library shows", () => {
    expect(resolveTypeGroup("image/svg+xml")).to.equal("vector");
    expect(resolveTypeGroup("IMAGE/PNG")).to.equal("image");
    expect(resolveTypeGroup("video/mp4")).to.equal("video");
    expect(resolveTypeGroup("application/pdf")).to.equal("pdf");
    expect(resolveTypeGroup("text/csv")).to.equal("spreadsheet");
    expect(resolveTypeGroup("application/msword")).to.equal("document");
    expect(resolveTypeGroup("application/zip")).to.equal("archive");
    expect(resolveTypeGroup("application/x-unknown")).to.equal("other");
    expect(isDescribableImage("image/svg+xml")).to.equal(true);
    expect(isDescribableImage("application/pdf")).to.equal(false);
  });
});

describe("[unit] library — listing", () => {
  const assets = [
    asset("b", { size: 30, createdAt: new Date("2026-02-01") }),
    asset("a10", { size: 10 }),
    asset("a2", { size: 20, mimetype: "application/pdf" }),
  ];

  it("sorts names naturally and pages the result", () => {
    const page = pageAssets(assets, {
      offset: 0,
      limit: 2,
      sort: "name",
      direction: "asc",
    });
    expect(page.assets.map((entry) => entry._id)).to.deep.equal(["a2", "a10"]);
    expect(page.total).to.equal(3);
  });

  it("filters on a type group before counting", () => {
    const page = pageAssets(assets, {
      offset: 0,
      limit: 10,
      sort: "size",
      direction: "desc",
      type: "image",
    });
    expect(page.assets.map((entry) => entry._id)).to.deep.equal(["b", "a10"]);
    expect(page.total).to.equal(2);
    expect(countByTypeGroup(assets)).to.include({ image: 2, pdf: 1 });
  });
});

describe("[unit] library — folder stats", () => {
  it("adds every file to its folder and each ancestor", () => {
    const folders = [folder("root"), folder("child", "root", ["root"])];
    const stats = computeFolderStats(folders, [
      asset("x", { folderId: "child", size: 5 }),
      asset("y", { folderId: "root", size: 7 }),
      asset("z", { folderId: "missing" }),
    ]);
    expect(stats.get("root")).to.deep.equal({
      fileCount: 2,
      size: 12,
      directFileCount: 1,
    });
    expect(stats.get("child")).to.deep.equal({
      fileCount: 1,
      size: 5,
      directFileCount: 1,
    });
  });
});

describe("[unit] library — search", () => {
  const assets = [
    asset("oak-desk"),
    asset("walnut", { alt: "An OAK finish" }),
    asset("old", { updatedAt: new Date("2020-01-01") }),
  ];

  it("matches names first, then alt text, and applies the filters", () => {
    const hits = searchAssets(assets, {
      query: {
        q: "oak",
        offset: 0,
        limit: 10,
        sort: "name",
        direction: "asc",
        visibility: "any",
        modified: "any",
      },
      now: new Date("2026-06-01"),
      visibilityOf: () => "private",
    });
    expect(hits.map((hit) => [hit.asset._id, hit.matchedOn])).to.deep.equal([
      ["oak-desk", "name"],
      ["walnut", "alt"],
    ]);
    const recent = searchAssets(assets, {
      query: {
        q: "",
        offset: 0,
        limit: 10,
        sort: "name",
        direction: "asc",
        visibility: "private",
        modified: "year",
      },
      now: new Date("2026-06-01"),
      visibilityOf: () => "private",
    });
    expect(recent.map((hit) => hit.asset._id)).to.not.include("old");
  });

  it("matches folder names without a term only when one is given", () => {
    const folders = [folder("Oak shots"), folder("Brand")];
    expect(
      searchFolders(folders, "OAK").map((entry) => entry._id),
    ).to.deep.equal(["Oak shots"]);
    expect(searchFolders(folders, "")).to.deep.equal([]);
  });
});

describe("[unit] library — server translations", () => {
  it("falls back to the base language, then to English", () => {
    expect(resolveLocale("fr")).to.equal("fr-FR");
    expect(resolveLocale("fr-BE")).to.equal("fr-FR");
    expect(resolveLocale("de")).to.equal("en-GB");
    expect(resolveLocale(undefined)).to.equal("en-GB");
  });

  it("interpolates parameters and picks the plural form", () => {
    const english = createMediaTranslator("en");
    expect(
      english.t("$dms_media.overview.largest.detail", { count: 1, files: "1" }),
    ).to.equal("1 file");
    expect(
      english.t("$dms_media.overview.largest.detail", { count: 3, files: "3" }),
    ).to.equal("3 files");
    expect(english.t("$dms_media.missing.key")).to.equal(
      "dms_media.missing.key",
    );
    expect(english.formatBytes(1536)).to.equal("1.5 KB");
    const french = createMediaTranslator("fr");
    expect(french.t("$dms_media.types.video")).to.equal("Vidéos");
  });
});

describe("[unit] library — activity and batches", () => {
  const folders = new Map([["root", folder("root")]]);
  const events = [
    event("e3", { kind: "asset.delete", createdAt: new Date("2026-01-03") }),
    event("e2", { json_details: JSON.stringify({ batchId: "b1" }) }),
    event("e1", { json_details: JSON.stringify({ batchId: "b1" }) }),
    event("e0", {
      kind: "upload.batch",
      json_details: JSON.stringify({ batchId: "b1", failed: 1 }),
    }),
  ];

  it("folds the files of a batch into one entry", () => {
    const items = buildActivityItems({ events, foldersById: folders }, 10);
    expect(items.map((item) => item.title)).to.deep.equal([
      "$dms_media.activity.asset_delete",
      "$dms_media.activity.asset_upload_many",
      "$dms_media.activity.upload_batch",
    ]);
    expect(items[1]?.params?.count).to.equal("2");
  });

  it("summarizes a batch with its failures", () => {
    const [batch] = buildUploadBatches(events, folders);
    expect(batch).to.include({
      _id: "b1",
      files: 2,
      failed: 1,
      result: "partial",
    });
  });
});

describe("[unit] library — zip", () => {
  it("writes a stored archive with every entry", () => {
    const chunks: Buffer[] = [];
    const zip = new ZipWriter((chunk) => chunks.push(chunk));
    zip.addFile("a.txt", Buffer.from("hello"), new Date("2026-01-01"));
    zip.addFile("b.txt", Buffer.from("world"), new Date("2026-01-01"));
    zip.finish();
    const archive = Buffer.concat(chunks);
    const end = archive.subarray(archive.length - ZIP_END_RECORD_SIZE);
    expect(end.readUInt32LE(0)).to.equal(ZIP_END_SIGNATURE);
    expect(end.readUInt16LE(ZIP_ENTRY_COUNT_OFFSET)).to.equal(2);
    expect(archive.includes(Buffer.from("hello"))).to.equal(true);
  });

  it("renames duplicate entries", () => {
    const taken = new Set<string>();
    expect(uniqueEntryName("photo.jpg", taken)).to.equal("photo.jpg");
    expect(uniqueEntryName("Photo.jpg", taken)).to.equal("Photo (2).jpg");
    expect(uniqueEntryName("notes", taken)).to.equal("notes");
    expect(uniqueEntryName("notes", taken)).to.equal("notes (2)");
  });
});
