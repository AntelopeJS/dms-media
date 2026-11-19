import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { readBody } from "../helpers/bodies";
import {
  aclFolder,
  assetDetailBody,
  bulkBody,
  isRefused,
  memberHolding,
  uploadPng,
  zipFolder,
} from "../helpers/member-rights";
import {
  createFolder,
  folders as worldFolders,
  HTTP_FORBIDDEN,
  HTTP_OK,
  owner,
  STOCK_BINDING_ID,
} from "../helpers/permissions-world";
import { zipEntryNames } from "../helpers/zip";

const SMALL_PNG = { width: 4, height: 4 };

const boundFolderBody = z.object({
  folder: z.object({ id: z.string() }).nullable(),
});
const treeNamesBody = z.object({
  folders: z.array(z.object({ id: z.string(), name: z.string() })),
});

async function fileOf(
  client: AxiosInstance,
  id: string,
): Promise<z.infer<typeof assetDetailBody>["asset"]> {
  const response = await client.get(`/api/media/assets/${id}`);
  expect(response.status, `read ${id}`).to.equal(HTTP_OK);
  return readBody(response, assetDetailBody).asset;
}

async function removeRoots(rootIds: string[]): Promise<void> {
  for (const rootId of rootIds) {
    await owner.delete(`/api/media/folders/${rootId}`);
  }
}

/** What a member reaches through the library, run against the permissions world. */
export function permissionReachSuites(): void {
  describe("what a member reaches", reachTests);
  describe("bulk writes keep the per-file rules", bulkRuleTests);
  describe("folder zips and cascades", cascadeTests);
}

function reachTests(): void {
  const roots: string[] = [];
  let client: AxiosInstance;
  let managed: string;
  let closed: string;

  before(async () => {
    managed = await aclFolder(owner, "Reach managed", "access.limits", [
      "manage",
    ]);
    closed = await createFolder(owner, "Reach closed");
    roots.push(managed, closed);
    client = (await memberHolding("Limited", ["access.limits"])).client;
  });

  after(async () => {
    await removeRoots(roots);
  });

  it("answers a null folder for a binding the member cannot see, and the folder to the owner", async () => {
    const asMember = await client.get(
      `/api/media/bindings/${STOCK_BINDING_ID}/folder`,
    );
    expect(asMember.status).to.equal(HTTP_OK);
    expect(readBody(asMember, boundFolderBody).folder).to.equal(null);
    const asOwner = await owner.get(
      `/api/media/bindings/${STOCK_BINDING_ID}/folder`,
    );
    expect(readBody(asOwner, boundFolderBody).folder?.id).to.equal(
      worldFolders.stock,
    );
  });

  it("refuses starter folders without manage at the root, and creates none", async () => {
    const starter = await client.post("/api/media/folders/starter", {
      folders: [{ name: "Reach catalog", visibility: "private" }],
    });
    expect(starter.status).to.equal(HTTP_FORBIDDEN);
    const tree = readBody(await owner.get("/api/media/tree"), treeNamesBody);
    expect(tree.folders.map((folder) => folder.name)).to.not.include(
      "Reach catalog",
    );
  });

  it("zips a folder only with the read right", async () => {
    await uploadPng(owner, managed, "open.png", SMALL_PNG);
    const denied = await zipFolder(client, closed);
    expect(isRefused(denied), `status ${denied.status}`).to.equal(true);
    const allowed = await zipFolder(client, managed);
    expect(allowed.status).to.equal(HTTP_OK);
    expect(zipEntryNames(allowed.data)).to.deep.equal(["open.png"]);
  });

  it("deletes the reachable files of a bulk delete and refuses the others, which stay", async () => {
    const open = await uploadPng(owner, managed, "bulk-open.png", SMALL_PNG);
    const shut = await uploadPng(owner, closed, "bulk-shut.png", SMALL_PNG);
    const bulk = readBody(
      await client.post("/api/media/assets/bulk/delete", {
        ids: [open.id, shut.id],
      }),
      bulkBody,
    );
    expect(bulk.done).to.deep.equal([open.id]);
    expect(bulk.refused.map((row) => row.id)).to.deep.equal([shut.id]);
    expect((await owner.get(`/api/media/assets/${shut.id}`)).status).to.equal(
      HTTP_OK,
    );
  });
}

function bulkRuleTests(): void {
  const roots: string[] = [];
  const permission = "access.bulkvis";
  let client: AxiosInstance;
  let privateA: string;
  let privateB: string;
  let publicC: string;
  let readOnly: string;

  async function twoFilesInA(prefix: string) {
    return {
      one: await uploadPng(owner, privateA, `${prefix}-one.png`, SMALL_PNG),
      two: await uploadPng(owner, privateA, `${prefix}-two.png`, SMALL_PNG),
    };
  }

  before(async () => {
    privateA = await aclFolder(owner, "Bulk A", permission, ["manage"]);
    privateB = await aclFolder(owner, "Bulk B", permission, ["manage"]);
    publicC = await aclFolder(owner, "Bulk C", permission, ["manage"]);
    readOnly = await aclFolder(owner, "Bulk read only", permission, ["read"]);
    roots.push(privateA, privateB, publicC, readOnly);
    const publish = await owner.post(
      `/api/media/folders/${publicC}/visibility`,
      {
        visibility: "public",
      },
    );
    expect(publish.status).to.equal(HTTP_OK);
    client = (await memberHolding("BulkManager", [permission])).client;
  });

  after(async () => {
    await removeRoots(roots);
  });

  it("refuses every file of a bulk visibility change with 403 and changes none", async () => {
    const { one, two } = await twoFilesInA("vis");
    const bulk = readBody(
      await client.post("/api/media/assets/bulk/visibility", {
        ids: [one.id, two.id],
        visibility: "public",
      }),
      bulkBody,
    );
    expect(bulk.done).to.deep.equal([]);
    expect(
      bulk.refused.map((row) => [row.id, row.status]),
    ).to.have.deep.members([
      [one.id, HTTP_FORBIDDEN],
      [two.id, HTTP_FORBIDDEN],
    ]);
    for (const { id } of [one, two]) {
      expect((await fileOf(owner, id)).visibility).to.equal("inherit");
    }
  });

  it("refuses a bulk move that would make files public with 403 and keeps them in their folder", async () => {
    const { one, two } = await twoFilesInA("public");
    const bulk = readBody(
      await client.post("/api/media/assets/bulk/move", {
        ids: [one.id, two.id],
        folderId: publicC,
      }),
      bulkBody,
    );
    expect(bulk.done).to.deep.equal([]);
    expect(
      bulk.refused.map((row) => [row.id, row.status]),
    ).to.have.deep.members([
      [one.id, HTTP_FORBIDDEN],
      [two.id, HTTP_FORBIDDEN],
    ]);
    for (const { id } of [one, two]) {
      const asset = await fileOf(owner, id);
      expect(asset.folderId).to.equal(privateA);
      expect(asset.visibility).to.equal("inherit");
    }
  });

  it("refuses a bulk move into a folder the member only reads", async () => {
    const { one } = await twoFilesInA("readonly-target");
    const bulk = readBody(
      await client.post("/api/media/assets/bulk/move", {
        ids: [one.id],
        folderId: readOnly,
      }),
      bulkBody,
    );
    expect(bulk.done).to.deep.equal([]);
    expect(bulk.refused.map((row) => [row.id, row.status])).to.deep.equal([
      [one.id, HTTP_FORBIDDEN],
    ]);
    expect((await fileOf(owner, one.id)).folderId).to.equal(privateA);
  });

  it("refuses a bulk delete in a folder the member only reads, and keeps the file", async () => {
    const kept = await uploadPng(owner, readOnly, "read-only.png", SMALL_PNG);
    const bulk = readBody(
      await client.post("/api/media/assets/bulk/delete", { ids: [kept.id] }),
      bulkBody,
    );
    expect(bulk.done).to.deep.equal([]);
    expect(bulk.refused.map((row) => [row.id, row.status])).to.deep.equal([
      [kept.id, HTTP_FORBIDDEN],
    ]);
    expect((await owner.get(`/api/media/assets/${kept.id}`)).status).to.equal(
      HTTP_OK,
    );
  });

  it("moves files between private folders in bulk", async () => {
    const { one, two } = await twoFilesInA("private");
    const bulk = readBody(
      await client.post("/api/media/assets/bulk/move", {
        ids: [one.id, two.id],
        folderId: privateB,
      }),
      bulkBody,
    );
    expect(bulk.done).to.deep.equal([one.id, two.id]);
    expect(bulk.refused).to.deep.equal([]);
  });
}

function cascadeTests(): void {
  const roots: string[] = [];
  const permission = "access.cascade";
  let client: AxiosInstance;

  before(async () => {
    client = (await memberHolding("Cascader", [permission])).client;
  });

  after(async () => {
    await removeRoots(roots);
  });

  it("zips a readable folder without the subfolders the member cannot read", async () => {
    const readable = await aclFolder(owner, "Zip readable", permission, [
      "read",
    ]);
    roots.push(readable);
    const hidden = await aclFolder(
      owner,
      "Caché",
      "access.someoneelse",
      ["read"],
      readable,
    );
    await uploadPng(owner, readable, "visible.png", SMALL_PNG);
    await uploadPng(owner, hidden, "secret.png", SMALL_PNG);
    const zip = await zipFolder(client, readable);
    expect(zip.status).to.equal(HTTP_OK);
    expect(zipEntryNames(zip.data)).to.deep.equal(["visible.png"]);
  });

  it("keeps a folder, its subfolder and the subfolder's file when the delete is refused", async () => {
    const parent = await aclFolder(owner, "Cascade", permission, ["manage"]);
    roots.push(parent);
    const child = await aclFolder(
      owner,
      "Read only child",
      permission,
      ["read"],
      parent,
    );
    const kept = await uploadPng(owner, child, "keep.png", SMALL_PNG);
    const denied = await client.delete(`/api/media/folders/${parent}`);
    expect(denied.status).to.equal(HTTP_FORBIDDEN);
    const tree = readBody(await owner.get("/api/media/tree"), treeNamesBody);
    const ids = tree.folders.map((folder) => folder.id);
    expect(ids).to.include.members([parent, child]);
    expect((await owner.get(`/api/media/assets/${kept.id}`)).status).to.equal(
      HTTP_OK,
    );
  });
}
