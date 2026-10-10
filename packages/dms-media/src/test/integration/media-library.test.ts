import type { AxiosInstance } from "axios";
import { expect } from "chai";
import {
  ONE_PIXEL_PNG,
  PNG_MIMETYPE,
  uploadAssetInBatch,
  uploadTextAsset,
} from "../helpers/assets";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_END_SIGNATURE = 0x06054b50;
const ZIP_END_RECORD_SIZE = 22;
const ZIP_ENTRY_COUNT_OFFSET = 10;
const BATCH_ID = "batch-library-test";
const BATCH_FILES = 3;

interface CountParam {
  type: string;
  value: number;
}

interface AssetRow {
  id: string;
  name: string;
  folderId: string;
  alt?: string;
  starred: boolean;
  typeGroup: string;
  matchedOn?: string;
}

describe("[integration] media library — listings, search, bulk and overview", () => {
  let client: AxiosInstance;
  let rootId: string;
  let childId: string;
  let otherId: string;
  const ids: Record<string, string> = {};

  before(async function () {
    this.timeout(30_000);
    const session = await ensureOwnerSession();
    client = authorizedClient(session.accessToken);
    rootId = (await client.post("/api/media/folders", { name: "Library spec" }))
      .data.id;
    childId = (
      await client.post("/api/media/folders", {
        name: "Oak shots",
        parentId: rootId,
      })
    ).data.id;
    otherId = (
      await client.post("/api/media/folders", {
        name: "Other spec",
        parentId: rootId,
      })
    ).data.id;
    for (const name of ["oak-b.png", "oak-a.png", "walnut.png"]) {
      const asset = await uploadAssetInBatch(client, childId, {
        filename: name,
        mimetype: PNG_MIMETYPE,
        body: ONE_PIXEL_PNG,
        batchId: BATCH_ID,
      });
      ids[name] = asset.id;
    }
    ids["notes.txt"] = (await uploadTextAsset(client, childId, "notes.txt")).id;
  });

  after(async () => {
    await client.delete(`/api/media/folders/${rootId}`);
  });

  it("returns recursive counts, view counts and the upload limit with the tree", async () => {
    const response = await client.get("/api/media/tree");
    expect(response.status).to.equal(HTTP_OK);
    const root = response.data.folders.find(
      (folder: { id: string }) => folder.id === rootId,
    );
    expect(root.fileCount).to.equal(4);
    expect(root.size).to.be.greaterThan(0);
    expect(response.data.views.missingAlt).to.be.at.least(3);
    expect(response.data.maxUploadBytes).to.equal(500 * 1024 * 1024);
    expect(response.data.canManagePermissions).to.equal(true);
  });

  it("pages, sorts and filters a folder listing with type facets", async () => {
    const page = await client.get(`/api/media/folders/${childId}/assets`, {
      params: { limit: 2, sort: "name", direction: "asc" },
    });
    expect(page.status).to.equal(HTTP_OK);
    expect(page.data.total).to.equal(4);
    expect(page.data.assets.map((asset: AssetRow) => asset.name)).to.deep.equal(
      ["notes.txt", "oak-a.png"],
    );
    expect(page.data.facets).to.include({ all: 4, image: 3, document: 1 });
    const images = await client.get(`/api/media/folders/${childId}/assets`, {
      params: { type: "image", sort: "name", direction: "desc", offset: 1 },
    });
    expect(images.data.total).to.equal(3);
    expect(
      images.data.assets.map((asset: AssetRow) => asset.name),
    ).to.deep.equal(["oak-b.png", "oak-a.png"]);
  });

  it("rejects an unknown sort key", async () => {
    const response = await client.get(`/api/media/folders/${childId}/assets`, {
      params: { sort: "colour" },
    });
    expect(response.status).to.equal(HTTP_BAD_REQUEST);
  });

  it("stars files and folders and lists them in the starred view", async () => {
    for (const body of [
      { kind: "asset", targetId: ids["walnut.png"], starred: true },
      { kind: "folder", targetId: childId, starred: true },
    ]) {
      expect((await client.post("/api/media/favorites", body)).status).to.equal(
        HTTP_OK,
      );
    }
    const view = await client.get("/api/media/views/starred");
    expect(view.data.assets.map((asset: AssetRow) => asset.id)).to.include(
      ids["walnut.png"],
    );
    expect(
      view.data.folders.map((folder: { id: string }) => folder.id),
    ).to.include(childId);
    await client.post("/api/media/favorites", {
      kind: "asset",
      targetId: ids["walnut.png"],
      starred: false,
    });
    const after = await client.get("/api/media/views/starred");
    expect(after.data.assets.map((asset: AssetRow) => asset.id)).not.to.include(
      ids["walnut.png"],
    );
  });

  it("lists recent files newest first and images without alt text", async () => {
    const recent = await client.get("/api/media/views/recent");
    expect(recent.data.assets[0].id).to.equal(ids["notes.txt"]);
    await client.post(`/api/media/assets/${ids["oak-a.png"]}/update`, {
      alt: "Oak desk in a bright studio",
    });
    const missing = await client.get("/api/media/views/missing-alt");
    const names = missing.data.assets.map((asset: AssetRow) => asset.name);
    expect(names).to.include("oak-b.png");
    expect(names).not.to.include("oak-a.png");
    expect(names).not.to.include("notes.txt");
  });

  it("searches names, alt text and folders, scoped and filtered", async () => {
    const byAlt = await client.get("/api/media/search", {
      params: { q: "studio" },
    });
    expect(byAlt.data.assets).to.have.length(1);
    expect(byAlt.data.assets[0]).to.include({
      id: ids["oak-a.png"],
      matchedOn: "alt",
    });
    const byName = await client.get("/api/media/search", {
      params: { q: "OAK", folderId: rootId },
    });
    expect(byName.data.total).to.equal(2);
    expect(
      byName.data.folders.map((folder: { id: string }) => folder.id),
    ).to.deep.equal([childId]);
    const publicOnly = await client.get("/api/media/search", {
      params: { q: "oak", visibility: "public" },
    });
    expect(publicOnly.data.total).to.equal(0);
    const elsewhere = await client.get("/api/media/search", {
      params: { q: "oak", folderId: otherId },
    });
    expect(elsewhere.data.total).to.equal(0);
  });

  it("describes an asset with its path and uploader", async () => {
    const response = await client.get(
      `/api/media/assets/${ids["oak-a.png"]}/details`,
    );
    expect(response.status).to.equal(HTTP_OK);
    expect(
      response.data.path.map((entry: { name: string }) => entry.name),
    ).to.deep.equal(["Library spec", "Oak shots"]);
    expect(response.data.uploadedBy).to.equal("Test Owner");
  });

  it("serves the file page information list and tab counts", async () => {
    const assetId = ids["oak-a.png"];
    const information = await client.get(
      `/api/media/assets/${assetId}/information`,
    );
    expect(information.status).to.equal(HTTP_OK);
    expect(
      information.data.items.map((item: { id: string }) => item.id),
    ).to.deep.equal(["uploaded", "modified", "type", "asset-id"]);
    expect(information.data.items[0].detail).to.equal("Test Owner");
    expect(information.data.items[3].value).to.equal(assetId);
    const counts = await client.get(`/api/media/assets/${assetId}/tab-counts`);
    expect(counts.data).to.deep.equal({ delivery: 3 });
  });

  it("serves the delivery links with full URLs to copy, and how they are served", async () => {
    const assetId = ids["oak-a.png"];
    const links = await client.get(`/api/media/assets/${assetId}/delivery`);
    expect(links.status).to.equal(HTTP_OK);
    expect(
      links.data.items.map((item: { id: string }) => item.id),
    ).to.deep.equal(["stable", "thumb", "preview"]);
    const [stable] = links.data.items;
    expect(stable.value).to.equal(`/media/${assetId}/oak-a.png`);
    expect(stable.copyValue).to.match(
      new RegExp(`^https?://[^/]+/media/${assetId}/oak-a\\.png$`),
    );
    const notice = await client.get(
      `/api/media/assets/${assetId}/delivery/notice`,
    );
    expect(notice.status).to.equal(HTTP_OK);
    expect(notice.data.description).to.match(/delivery_(public|private)$/);
    expect(notice.data.actions[0].to).to.equal("/media/presets");
  });

  it("moves, changes visibility and deletes in bulk, reporting refusals", async () => {
    const moved = await client.post("/api/media/assets/bulk/move", {
      ids: [ids["oak-b.png"], "missing-asset"],
      folderId: otherId,
    });
    expect(moved.status).to.equal(HTTP_OK);
    expect(moved.data.done).to.deep.equal([ids["oak-b.png"]]);
    expect(moved.data.refused).to.have.length(1);
    expect(moved.data.refused[0]).to.include({
      id: "missing-asset",
      status: HTTP_NOT_FOUND,
    });
    const visibility = await client.post("/api/media/assets/bulk/visibility", {
      ids: [ids["oak-b.png"]],
      visibility: "public",
    });
    expect(visibility.data.done).to.have.length(1);
    const publicOnly = await client.get("/api/media/search", {
      params: { q: "oak", visibility: "public" },
    });
    expect(publicOnly.data.total).to.equal(1);
  });

  it("streams a zip of the selection", async () => {
    const response = await client.post(
      "/api/media/assets/zip",
      { ids: [ids["oak-a.png"], ids["walnut.png"], ids["notes.txt"]] },
      { responseType: "arraybuffer" },
    );
    expect(response.status).to.equal(HTTP_OK);
    expect(response.headers["content-type"]).to.contain("application/zip");
    const archive = Buffer.from(response.data);
    expect(archive.readUInt32LE(0)).to.equal(ZIP_LOCAL_SIGNATURE);
    const end = archive.subarray(archive.length - ZIP_END_RECORD_SIZE);
    expect(end.readUInt32LE(0)).to.equal(ZIP_END_SIGNATURE);
    expect(end.readUInt16LE(ZIP_ENTRY_COUNT_OFFSET)).to.equal(3);
  });

  it("summarizes what deleting a folder removes", async () => {
    const response = await client.get(`/api/media/folders/${rootId}/impact`);
    expect(response.status).to.equal(HTTP_OK);
    expect(response.data).to.include({
      subfolders: 2,
      files: 4,
      publicFiles: 1,
      linkedSubfolders: 0,
    });
  });

  it("serves the overview blocks", async () => {
    const kpis = await client.get("/api/media/stats/kpis");
    expect(
      kpis.data.items.map((item: { id: string }) => item.id),
    ).to.deep.equal(["files", "storage", "public", "missing-alt"]);
    expect(kpis.data.items[0].detail.key).to.equal(
      "dms_media.overview.kpis.files_detail",
    );
    expect(kpis.data.items[0].detail.params.files.type).to.equal("count");
    expect(kpis.data.items[1].value.key).to.match(/^dms_media\.units\./);
    const storage = await client.get("/api/media/stats/storage");
    expect(storage.data.segments.length).to.be.at.least(2);
    expect(storage.data.valueLabel).to.match(/B$/);
    const largest = await client.get("/api/media/stats/largest");
    expect(largest.data.items[0].label).to.contain("›");
    const attention = await client.get("/api/media/stats/attention");
    expect(
      attention.data.items.map((item: { id: string }) => item.id),
    ).to.include("missing-alt");
    const folders = await client.get("/api/media/stats/folders");
    expect(
      folders.data.items.map((item: { id: string }) => item.id),
    ).to.include(rootId);
    const recent = await client.get("/api/media/stats/recent");
    expect(recent.data.assets.length).to.be.at.most(6);
  });

  it("folds one upload batch into a single activity entry", async () => {
    const response = await client.get("/api/media/activity", {
      params: { limit: 50 },
    });
    expect(response.status).to.equal(HTTP_OK);
    const batch = response.data.items.find(
      (item: { title: string; params: Record<string, CountParam> }) =>
        item.title === "$dms_media.activity.asset_upload" &&
        item.params.count?.value === BATCH_FILES,
    );
    expect(batch).to.not.equal(undefined);
    const history = await client.get(
      `/api/media/assets/${ids["oak-b.png"]}/history`,
    );
    const titles = history.data.items.map(
      (item: { title: string }) => item.title,
    );
    expect(titles).to.include("$dms_media.activity.asset_move");
    expect(titles).to.include("$dms_media.activity.asset_visibility");
    expect(titles).to.include("$dms_media.activity.asset_upload");
  });

  it("records a batch summary and lists upload batches", async () => {
    const report = await client.post("/api/media/upload/batches", {
      batchId: BATCH_ID,
      folderId: childId,
      total: 4,
      uploaded: 3,
      failed: 1,
      size: 300,
    });
    expect(report.status).to.equal(HTTP_OK);
    const batches = await client.get("/api/media/upload/batches");
    const row = batches.data.results.find(
      (entry: { _id: string }) => entry._id === BATCH_ID,
    );
    expect(row).to.include({ files: 3, failed: 1, result: "partial" });
    expect(row.folder).to.equal("Library spec › Oak shots");
  });

  it("summarizes who can see a folder and where its rules come from", async () => {
    const response = await client.get(`/api/media/folders/${childId}/access`);
    expect(response.status).to.equal(HTTP_OK);
    expect(
      response.data.chain.map((link: { name: string }) => link.name),
    ).to.deep.equal(["$dms_media.library.root", "Library spec", "Oak shots"]);
    expect(response.data.sourceId).to.equal(null);
    expect(response.data.isOwn).to.equal(false);
    expect(response.data.rights.manage.count).to.be.at.least(1);
    expect(response.data.canEdit).to.equal(true);
    const subjects = await client.get("/api/media/access/subjects");
    expect(
      subjects.data.permissions.map((entry: { id: string }) => entry.id),
    ).to.include("media.upload");
  });

  it("lists delivery presets with their cache keys", async () => {
    await client.post("/api/media/previews", { ids: [ids["oak-a.png"]] });
    const response = await client.get("/api/media/presets");
    expect(response.status).to.equal(HTTP_OK);
    const thumb = response.data.presets.find(
      (preset: { id: string }) => preset.id === "thumb",
    );
    expect(thumb.cacheKey).to.match(/^thumb\./);
    expect(thumb.rendered).to.be.at.least(1);
    expect(response.data.cache.schedule).to.equal("0 4 * * *");
  });

  it("lists linked folders as a source table", async () => {
    const response = await client.get("/api/media/linked");
    expect(response.status).to.equal(HTTP_OK);
    expect(response.data).to.have.keys(["results", "total"]);
  });

  it("refuses starter folders that clash with a root folder", async () => {
    const response = await client.post("/api/media/folders/starter", {
      folders: [{ name: "Library spec", visibility: "private" }],
    });
    expect(response.status).to.equal(HTTP_CONFLICT);
  });
});
