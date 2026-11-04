import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { putPresigned } from "../helpers/assets";
import { createdBody, presignBody, readBody } from "../helpers/bodies";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const READY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 200;
const FILE_CONTENT = "hello media library";
const FILE_NAME = "hello.txt";
const FILE_MIMETYPE = "text/plain";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMediaApi(client: AxiosInstance): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await client.get("/api/media/tree");
    if (response.status === HTTP_OK) return;
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error("Timed out waiting for the media API to be ready");
}

const treeBody = z.object({
  folders: z.array(
    z.object({
      id: z.string(),
      parentId: z.string().nullable(),
      rights: z
        .object({ read: z.boolean(), write: z.boolean(), manage: z.boolean() })
        .strict(),
    }),
  ),
});

describe("[integration] media API — owner lifecycle", () => {
  let client: AxiosInstance;
  let brandFolderId: string;
  let subFolderId: string;
  let assetId: string;

  before(async function () {
    this.timeout(READY_TIMEOUT_MS + 10_000);
    const session = await ensureOwnerSession();
    client = authorizedClient(session.accessToken);
    await waitForMediaApi(client);
  });

  it("starts with an empty tree and full root rights for the owner", async () => {
    const response = await client.get("/api/media/tree");
    expect(response.status).to.equal(HTTP_OK);
    expect(response.data.folders).to.deep.equal([]);
    expect(response.data.root).to.include({ write: true, manage: true });
  });

  it("creates a root folder and a subfolder", async () => {
    const created = await client.post("/api/media/folders", {
      name: "Brand",
    });
    expect(created.status).to.equal(HTTP_OK);
    brandFolderId = readBody(created, createdBody).id;
    expect(brandFolderId).to.be.a("string");

    const sub = await client.post("/api/media/folders", {
      name: "Logos",
      parentId: brandFolderId,
    });
    expect(sub.status).to.equal(HTTP_OK);
    subFolderId = readBody(sub, createdBody).id;

    const tree = await client.get("/api/media/tree");
    expect(tree.data.folders).to.have.length(2);
    const subNode = readBody(tree, treeBody).folders.find(
      (node) => node.id === subFolderId,
    );
    expect(subNode?.parentId).to.equal(brandFolderId);
    expect(subNode?.rights).to.deep.equal({
      read: true,
      write: true,
      manage: true,
    });
  });

  it("rejects duplicate sibling folder names", async () => {
    const duplicate = await client.post("/api/media/folders", {
      name: "Brand",
    });
    expect(duplicate.status).to.equal(409);
  });

  it("uploads a file through presign, PUT and confirm", async () => {
    const body = Buffer.from(FILE_CONTENT);
    const presign = await client.post("/api/media/upload/presign", {
      folderId: brandFolderId,
      filename: FILE_NAME,
      size: body.byteLength,
      mimetype: FILE_MIMETYPE,
    });
    expect(presign.status).to.equal(HTTP_OK);
    const presigned = readBody(presign, presignBody);
    expect(presigned.resourceKey).to.be.a("string");

    const putStatus = (await putPresigned(presigned, body)).status;
    expect(putStatus).to.be.lessThan(300);

    const confirm = await client.post("/api/media/upload/confirm", {
      folderId: brandFolderId,
      resourceKey: presigned.resourceKey,
      filename: FILE_NAME,
    });
    expect(confirm.status).to.equal(HTTP_OK);
    assetId = readBody(confirm, z.object({ asset: createdBody })).asset.id;
    expect(confirm.data.asset.name).to.equal(FILE_NAME);
    expect(confirm.data.asset.mimetype).to.equal(FILE_MIMETYPE);
    expect(confirm.data.asset.size).to.equal(body.byteLength);
    expect(confirm.data.asset.effectiveVisibility).to.equal("private");
  });

  it("lists the asset in its folder and finds it via search", async () => {
    const listing = await client.get(
      `/api/media/folders/${brandFolderId}/assets`,
    );
    expect(listing.status).to.equal(HTTP_OK);
    expect(listing.data.assets).to.have.length(1);
    expect(listing.data.assets[0].id).to.equal(assetId);

    const search = await client.get("/api/media/assets/search?q=hello");
    expect(search.status).to.equal(HTTP_OK);
    expect(search.data.assets).to.have.length(1);

    const miss = await client.get("/api/media/assets/search?q=nomatch");
    expect(miss.data.assets).to.have.length(0);
  });

  it("renames, moves and flips visibility of the asset", async () => {
    const renamed = await client.post(`/api/media/assets/${assetId}/update`, {
      name: "renamed.txt",
      alt: "A text file",
    });
    expect(renamed.status).to.equal(HTTP_OK);

    const moved = await client.post(`/api/media/assets/${assetId}/move`, {
      folderId: subFolderId,
    });
    expect(moved.status).to.equal(HTTP_OK);

    const flipped = await client.post(
      `/api/media/assets/${assetId}/visibility`,
      { visibility: "public" },
    );
    expect(flipped.status).to.equal(HTTP_OK);

    const detail = await client.get(`/api/media/assets/${assetId}`);
    expect(detail.status).to.equal(HTTP_OK);
    expect(detail.data.asset.name).to.equal("renamed.txt");
    expect(detail.data.asset.folderId).to.equal(subFolderId);
    expect(detail.data.asset.effectiveVisibility).to.equal("public");
  });

  it("moves and renames folders with cycle protection", async () => {
    const renamed = await client.post(
      `/api/media/folders/${subFolderId}/rename`,
      { name: "Icons" },
    );
    expect(renamed.status).to.equal(HTTP_OK);

    const cycle = await client.post(
      `/api/media/folders/${brandFolderId}/move`,
      { parentId: subFolderId },
    );
    expect(cycle.status).to.equal(400);

    const toRoot = await client.post(`/api/media/folders/${subFolderId}/move`, {
      parentId: null,
    });
    expect(toRoot.status).to.equal(HTTP_OK);

    const back = await client.post(`/api/media/folders/${subFolderId}/move`, {
      parentId: brandFolderId,
    });
    expect(back.status).to.equal(HTTP_OK);
  });

  it("deletes the asset then the folder tree", async () => {
    const deletedAsset = await client.delete(`/api/media/assets/${assetId}`);
    expect(deletedAsset.status).to.equal(HTTP_OK);

    const gone = await client.get(`/api/media/assets/${assetId}`);
    expect(gone.status).to.equal(HTTP_NOT_FOUND);

    const deletedFolder = await client.delete(
      `/api/media/folders/${brandFolderId}`,
    );
    expect(deletedFolder.status).to.equal(HTTP_OK);

    const tree = await client.get("/api/media/tree");
    expect(tree.data.folders).to.deep.equal([]);
  });
});
