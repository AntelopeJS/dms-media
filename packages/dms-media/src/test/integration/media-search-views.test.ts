import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { uploadAsset } from "../helpers/assets";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const TEXT_MIMETYPE = "text/plain";
const SMALL_BODY = Buffer.alloc(10, 1);
const LARGE_BODY = Buffer.alloc(5000, 1);
const MEDIUM_BODY = Buffer.alloc(800, 1);

interface AssetRow {
  id: string;
  name: string;
  size: number;
}

interface FolderRow {
  id: string;
  name: string;
  fileCount: number;
  link: { isContentRoot: boolean } | null;
  accepts: string[] | null;
}

describe("[integration] media search views — search, smart views and folder counts", () => {
  let client: AxiosInstance;
  let rootId: string;
  let childId: string;

  before(async function () {
    this.timeout(30_000);
    const session = await ensureOwnerSession();
    client = authorizedClient(session.accessToken);
    rootId = (
      await client.post("/api/media/folders", { name: "Facets Été 2026" })
    ).data.id;
    childId = (
      await client.post("/api/media/folders", {
        name: "Facets Produits",
        parentId: rootId,
      })
    ).data.id;
    await uploadAsset(
      client,
      rootId,
      "Été à Liège – vacances (1).txt",
      TEXT_MIMETYPE,
      MEDIUM_BODY,
    );
    await uploadAsset(
      client,
      childId,
      "facets-photo-14.txt",
      TEXT_MIMETYPE,
      SMALL_BODY,
    );
    await uploadAsset(
      client,
      childId,
      "facets-photo-01.txt",
      TEXT_MIMETYPE,
      LARGE_BODY,
    );
  });

  after(async () => {
    await client.delete(`/api/media/folders/${rootId}`);
  });

  it("finds names typed without accents and with several words", async () => {
    for (const q of ["liege", "ETE a LIEGE", "vacances liège"]) {
      const response = await client.get("/api/media/search", {
        params: { q, folderId: rootId },
      });
      expect(
        response.data.assets.map((asset: AssetRow) => asset.name),
        q,
      ).to.deep.equal(["Été à Liège – vacances (1).txt"]);
    }
    const twoWords = await client.get("/api/media/search", {
      params: { q: "facets photo 14", folderId: rootId },
    });
    expect(
      twoWords.data.assets.map((asset: AssetRow) => asset.name),
    ).to.deep.equal(["facets-photo-14.txt"]);
  });

  it("answers nothing to a search without any word", async () => {
    for (const q of ["   ", " – "]) {
      const response = await client.get("/api/media/search", {
        params: { q },
      });
      expect(response.data.total, JSON.stringify(q)).to.equal(0);
      expect(response.data.folders).to.deep.equal([]);
    }
  });

  it("counts the files of folders found by a search", async () => {
    const response = await client.get("/api/media/search", {
      params: { q: "facets ete" },
    });
    const found = response.data.folders.find(
      (folder: FolderRow) => folder.id === rootId,
    );
    expect(found?.fileCount).to.equal(3);
  });

  it("counts the files of starred folders", async () => {
    await client.post("/api/media/favorites", {
      kind: "folder",
      targetId: childId,
      starred: true,
    });
    const response = await client.get("/api/media/views/starred");
    const starred = response.data.folders.find(
      (folder: FolderRow) => folder.id === childId,
    );
    expect(starred?.fileCount).to.equal(2);
  });

  it("lists the largest files first and bounds views to a folder", async () => {
    const response = await client.get("/api/media/views/largest", {
      params: { folderId: rootId },
    });
    expect(response.data.total).to.equal(3);
    const sizes = response.data.assets.map((asset: AssetRow) => asset.size);
    expect(sizes).to.deep.equal([...sizes].sort((a, b) => b - a));
    const scoped = await client.get("/api/media/views/recent", {
      params: { folderId: childId },
    });
    expect(scoped.data.total).to.equal(2);
  });

  it("filters a folder listing on its facets", async () => {
    const portrait = await client.get(`/api/media/folders/${childId}/assets`, {
      params: { orientation: "portrait" },
    });
    expect(portrait.data.total).to.equal(0);
    const publicOnly = await client.get(
      `/api/media/folders/${childId}/assets`,
      {
        params: { visibility: "public" },
      },
    );
    expect(publicOnly.data.total).to.equal(0);
  });

  it("describes the Content root link without its technical id", async () => {
    const tree = await client.get("/api/media/tree");
    const content = tree.data.folders.find(
      (folder: FolderRow) => folder.link?.isContentRoot,
    );
    if (content) expect(content.name).to.equal("Content");
    const plain = tree.data.folders.find(
      (folder: FolderRow) => folder.id === rootId,
    );
    expect(plain?.link).to.equal(null);
    expect(plain?.accepts).to.equal(null);
    expect(tree.data.allowedMimetypes)
      .to.be.an("array")
      .that.includes("application/pdf");
  });
});
