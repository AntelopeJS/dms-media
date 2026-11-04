import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { uploadAsset } from "../helpers/assets";
import { createdBody, readBody } from "../helpers/bodies";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const TEXT_MIMETYPE = "text/plain";
const SMALL_BODY = Buffer.alloc(10, 1);
const LARGE_BODY = Buffer.alloc(5000, 1);
const MEDIUM_BODY = Buffer.alloc(800, 1);

const folderRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  fileCount: z.number(),
  link: z.object({ isContentRoot: z.boolean() }).nullable(),
  accepts: z.array(z.string()).nullable(),
});

const foldersBody = z.object({ folders: z.array(folderRowSchema) });
const assetsBody = z.object({
  assets: z.array(
    z.object({ id: z.string(), name: z.string(), size: z.number() }),
  ),
});

describe("[integration] media search views — search, smart views and folder counts", () => {
  let client: AxiosInstance;
  let rootId: string;
  let childId: string;

  before(async function () {
    this.timeout(30_000);
    const session = await ensureOwnerSession();
    client = authorizedClient(session.accessToken);
    rootId = readBody(
      await client.post("/api/media/folders", { name: "Facets Été 2026" }),
      createdBody,
    ).id;
    childId = readBody(
      await client.post("/api/media/folders", {
        name: "Facets Produits",
        parentId: rootId,
      }),
      createdBody,
    ).id;
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
        readBody(response, assetsBody).assets.map((asset) => asset.name),
        q,
      ).to.deep.equal(["Été à Liège – vacances (1).txt"]);
    }
    const twoWords = await client.get("/api/media/search", {
      params: { q: "facets photo 14", folderId: rootId },
    });
    expect(
      readBody(twoWords, assetsBody).assets.map((asset) => asset.name),
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
    const found = readBody(response, foldersBody).folders.find(
      (folder) => folder.id === rootId,
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
    const starred = readBody(response, foldersBody).folders.find(
      (folder) => folder.id === childId,
    );
    expect(starred?.fileCount).to.equal(2);
  });

  it("lists the largest files first and bounds views to a folder", async () => {
    const response = await client.get("/api/media/views/largest", {
      params: { folderId: rootId },
    });
    expect(response.data.total).to.equal(3);
    const sizes = readBody(response, assetsBody).assets.map(
      (asset) => asset.size,
    );
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
    const { folders } = readBody(tree, foldersBody);
    const content = folders.find((folder) => folder.link?.isContentRoot);
    if (content) expect(content.name).to.equal("Content");
    const plain = folders.find((folder) => folder.id === rootId);
    expect(plain?.link).to.equal(null);
    expect(plain?.accepts).to.equal(null);
    expect(tree.data.allowedMimetypes)
      .to.be.an("array")
      .that.includes("application/pdf");
  });
});
