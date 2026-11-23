import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { FileExists } from "@antelopejs/interface-file-storage";
import { z } from "zod";
import { MediaAssetModel } from "../../db";
import { putPresigned, rawGet, uploadAsset } from "../helpers/assets";
import { createdBody, presignBody, readBody } from "../helpers/bodies";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import { solidPng } from "../helpers/png";

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_BAD_REQUEST = 400;
const HTTP_FOUND = 302;
const HTTP_UNAUTHORIZED = 401;
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
      name: z.string().optional(),
      visibility: z.string().optional(),
      parentId: z.string().nullable(),
      rights: z
        .object({ read: z.boolean(), write: z.boolean(), manage: z.boolean() })
        .strict(),
    }),
  ),
});

let client: AxiosInstance;
let brandFolderId: string;
let subFolderId: string;
let assetId: string;

describe("[integration] media API — owner lifecycle: folders", () => {
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
});

describe("[integration] media API — owner lifecycle: asset", () => {
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
});

describe("[integration] media API — owner lifecycle: teardown", () => {
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

async function folderIdOf(name: string, parentId?: string): Promise<string> {
  const created = await client.post("/api/media/folders", { name, parentId });
  expect(created.status, name).to.equal(HTTP_OK);
  return readBody(created, createdBody).id;
}

async function treeById() {
  const tree = await client.get("/api/media/tree");
  return new Map(
    readBody(tree, treeBody).folders.map((folder) => [folder.id, folder]),
  );
}

describe("[integration] media API — folder changes read back", () => {
  it("shows a renamed, moved and published folder in the tree and its impact, and keeps a subfolder private", async () => {
    const top = await folderIdOf("Tree top");
    const target = await folderIdOf("Tree target");
    try {
      const child = await folderIdOf("Child", top);
      const grand = await folderIdOf("Grand", child);
      const png = await solidPng(4, 4);
      const inTop = await uploadAsset(client, top, "top.png", "image/png", png);
      const inChild = await uploadAsset(
        client,
        child,
        "child.png",
        "image/png",
        png,
      );
      const rename = await client.post(`/api/media/folders/${child}/rename`, {
        name: "Enfant",
      });
      const move = await client.post(`/api/media/folders/${child}/move`, {
        parentId: target,
      });
      const inside = await client.post(`/api/media/folders/${child}/move`, {
        parentId: grand,
      });
      const publish = (id: string) =>
        client.post(`/api/media/folders/${id}/visibility`, {
          visibility: "public",
        });
      const published = await publish(top);
      expect([rename.status, move.status, published.status]).to.deep.equal([
        HTTP_OK,
        HTTP_OK,
        HTTP_OK,
      ]);
      expect(inside.status).to.equal(HTTP_BAD_REQUEST);
      const folders = await treeById();
      expect(folders.get(child)).to.include({
        name: "Enfant",
        parentId: target,
      });
      expect(folders.get(top)?.visibility).to.equal("public");
      expect(folders.get(grand)?.visibility).to.equal("private");
      expect((await rawGet(`/media/${inTop.id}/top.png`)).status).to.equal(
        HTTP_FOUND,
      );
      const impact = await client.get(`/api/media/folders/${target}/impact`);
      expect(impact.data).to.include({ subfolders: 2, files: 1 });
      expect((await publish(target)).status).to.equal(HTTP_OK);
      expect((await rawGet(`/media/${inChild.id}/child.png`)).status).to.equal(
        HTTP_UNAUTHORIZED,
      );
    } finally {
      await client.delete(`/api/media/folders/${top}`);
      await client.delete(`/api/media/folders/${target}`);
    }
  });

  it("deletes a folder with its subfolders, their files and stored bytes, and leaves another folder's file serving the same bytes", async () => {
    const doomed = await folderIdOf("Doomed");
    const kept = await folderIdOf("Kept");
    try {
      const sub = await folderIdOf("Sub", doomed);
      const bytes = await solidPng(8, 8);
      const gone = await uploadAsset(
        client,
        sub,
        "gone.png",
        "image/png",
        bytes,
      );
      const stays = await uploadAsset(
        client,
        kept,
        "stays.png",
        "image/png",
        bytes,
      );
      const doomedAsset = await GetModel(
        MediaAssetModel,
        DEFAULT_TENANT_ID,
      ).get(gone.id);
      assert.isDefined(doomedAsset, "the doomed asset");
      const { storageKey } = doomedAsset;
      expect(await FileExists(storageKey)).to.equal(true);
      const impact = await client.get(`/api/media/folders/${doomed}/impact`);
      expect(impact.data).to.include({
        subfolders: 1,
        files: 1,
        size: bytes.byteLength,
      });
      expect(
        (await client.delete(`/api/media/folders/${doomed}`)).status,
      ).to.equal(HTTP_OK);
      const folders = await treeById();
      expect(folders.has(doomed) || folders.has(sub)).to.equal(false);
      expect(folders.has(kept)).to.equal(true);
      expect((await client.get(`/media/${gone.id}/gone.png`)).status).to.equal(
        HTTP_NOT_FOUND,
      );
      expect(await FileExists(storageKey)).to.equal(false);
      const served = await client.get(`/media/${stays.id}/stays.png`, {
        responseType: "arraybuffer",
      });
      expect(served.status).to.equal(HTTP_OK);
      expect(Buffer.from(served.data).equals(bytes)).to.equal(true);
    } finally {
      await client.delete(`/api/media/folders/${doomed}`);
      await client.delete(`/api/media/folders/${kept}`);
    }
  });
});
