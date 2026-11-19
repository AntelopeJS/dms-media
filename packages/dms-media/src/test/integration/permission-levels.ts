import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { readBody } from "../helpers/bodies";
import {
  aclFolder,
  assetDetailBody,
  bulkBody,
  isAllowed,
  isRefused,
  memberHolding,
  uploadPng,
  zipFolder,
} from "../helpers/member-rights";
import {
  createFolder,
  HTTP_FORBIDDEN,
  HTTP_OK,
  owner,
  ROTATE_QUARTER_TURN,
} from "../helpers/permissions-world";
import { zipEntryNames } from "../helpers/zip";

const PNG_SIZE = { width: 8, height: 6 };
const PERMISSION = "access.levels";

const treeNamesBody = z.object({
  folders: z.array(z.object({ id: z.string(), name: z.string() })),
});

/** The folders and files one member holds each right over, and the member. */
interface LevelFixture {
  client: AxiosInstance;
  unrelated: string;
  readFolder: string;
  writeFolder: string;
  writeFolderTwo: string;
  manageFolder: string;
  manageFolderTwo: string;
  inUnrelated: string;
  inRead: string[];
  inWrite: string[];
}

async function fileOf(
  client: AxiosInstance,
  id: string,
): Promise<z.infer<typeof assetDetailBody>["asset"]> {
  const response = await client.get(`/api/media/assets/${id}`);
  expect(response.status, `read ${id}`).to.equal(HTTP_OK);
  return readBody(response, assetDetailBody).asset;
}

function expectLevel(
  route: string,
  below: { status: number },
  at: { status: number },
): void {
  expect(
    isRefused(below),
    `${route} below its right: ${below.status}`,
  ).to.equal(true);
  expect(isAllowed(at), `${route} at its right: ${at.status}`).to.equal(true);
}

async function putAll(folderId: string, prefix: string, count: number) {
  const ids: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    const file = await uploadPng(
      owner,
      folderId,
      `${prefix}${index}.png`,
      PNG_SIZE,
    );
    ids.push(file.id);
  }
  return ids;
}

/** Builds the folders held at each right, with files to act on, and the member holding them. */
async function buildLevelFixture(roots: string[]): Promise<LevelFixture> {
  const folder = (
    name: string,
    permission: string,
    right: "read" | "write" | "manage",
  ) => aclFolder(owner, name, permission, [right]);
  const unrelated = await folder("Levels other", "access.levels.other", "read");
  const readFolder = await folder("Levels read", PERMISSION, "read");
  const writeFolder = await folder("Levels write", PERMISSION, "write");
  const writeFolderTwo = await folder("Levels write two", PERMISSION, "write");
  const manageFolder = await folder("Levels manage", PERMISSION, "manage");
  const manageFolderTwo = await folder(
    "Levels manage two",
    PERMISSION,
    "manage",
  );
  roots.push(
    unrelated,
    readFolder,
    writeFolder,
    writeFolderTwo,
    manageFolder,
    manageFolderTwo,
  );
  const [inUnrelated] = await putAll(unrelated, "n", 1);
  const inRead = await putAll(readFolder, "r", 4);
  const inWrite = await putAll(writeFolder, "w", 5);
  for (const id of [inRead[2], inWrite[2]]) {
    const rotated = await owner.post(`/api/media/assets/${id}/transform`, {
      rotate: ROTATE_QUARTER_TURN,
    });
    expect(
      rotated.status,
      "owner rotates so the file has an original",
    ).to.equal(HTTP_OK);
  }
  const member = await memberHolding("Leveled", [PERMISSION]);
  return {
    client: member.client,
    unrelated,
    readFolder,
    writeFolder,
    writeFolderTwo,
    manageFolder,
    manageFolderTwo,
    inUnrelated,
    inRead,
    inWrite,
  };
}

function fileRouteTests(fx: () => LevelFixture): void {
  for (const suffix of [
    "/history",
    "/information",
    "/delivery",
    "/tab-counts",
  ]) {
    it(`needs the read right to GET /assets/:id${suffix}`, async () => {
      const { client, inRead, inUnrelated } = fx();
      const below = await client.get(
        `/api/media/assets/${inUnrelated}${suffix}`,
      );
      const at = await client.get(`/api/media/assets/${inRead[0]}${suffix}`);
      expectLevel(`GET ${suffix}`, below, at);
    });
  }

  it("zips a folder only with the read right, holding every file of it", async () => {
    const { client, inRead, readFolder, unrelated } = fx();
    const below = await zipFolder(client, unrelated);
    const at = await zipFolder(client, readFolder);
    expectLevel("zip", below, at);
    expect(zipEntryNames(at.data)).to.have.length(inRead.length);
  });

  it("needs the write right to rename a file", async () => {
    const { client, inRead, inWrite } = fx();
    const below = await client.post(`/api/media/assets/${inRead[0]}/update`, {
      name: "read.png",
    });
    const at = await client.post(`/api/media/assets/${inWrite[0]}/update`, {
      name: "written.png",
    });
    expectLevel("update name", below, at);
    expect((await fileOf(owner, inRead[0])).name).to.equal("r1.png");
    expect((await fileOf(owner, inWrite[0])).name).to.equal("written.png");
  });

  it("needs the write right to save an edit as a copy", async () => {
    const { client, inRead, inWrite } = fx();
    const below = await client.post(
      `/api/media/assets/${inRead[1]}/transform/copy`,
      { rotate: ROTATE_QUARTER_TURN },
    );
    const at = await client.post(
      `/api/media/assets/${inWrite[1]}/transform/copy`,
      { rotate: ROTATE_QUARTER_TURN },
    );
    expectLevel("transform/copy", below, at);
  });

  it("needs the write right on the folder a file leaves", async () => {
    const { client, inRead, inWrite, readFolder, writeFolderTwo } = fx();
    const below = await client.post(`/api/media/assets/${inRead[3]}/move`, {
      folderId: writeFolderTwo,
    });
    const at = await client.post(`/api/media/assets/${inWrite[3]}/move`, {
      folderId: writeFolderTwo,
    });
    expectLevel("move out of a folder", below, at);
    expect((await fileOf(owner, inRead[3])).folderId).to.equal(readFolder);
  });

  it("needs the write right on both sides of a bulk move and for a bulk delete", async () => {
    const { client, inRead, inWrite, writeFolderTwo } = fx();
    const moveBelow = readBody(
      await client.post("/api/media/assets/bulk/move", {
        ids: [inRead[0]],
        folderId: writeFolderTwo,
      }),
      bulkBody,
    );
    const moveAt = readBody(
      await client.post("/api/media/assets/bulk/move", {
        ids: [inWrite[0]],
        folderId: writeFolderTwo,
      }),
      bulkBody,
    );
    const deleteBelow = readBody(
      await client.post("/api/media/assets/bulk/delete", {
        ids: [inRead[1]],
      }),
      bulkBody,
    );
    const deleteAt = readBody(
      await client.post("/api/media/assets/bulk/delete", {
        ids: [inWrite[1]],
      }),
      bulkBody,
    );
    expect(moveBelow.done).to.deep.equal([]);
    expect(moveBelow.refused.map((row) => row.status)).to.deep.equal([
      HTTP_FORBIDDEN,
    ]);
    expect(moveAt.done).to.deep.equal([inWrite[0]]);
    expect(deleteBelow.done).to.deep.equal([]);
    expect(deleteBelow.refused.map((row) => row.status)).to.deep.equal([
      HTTP_FORBIDDEN,
    ]);
    expect(deleteAt.done).to.deep.equal([inWrite[1]]);
  });
}

function folderRouteTests(fx: () => LevelFixture): void {
  it("needs the manage right to create a subfolder", async () => {
    const { client, manageFolder, writeFolder } = fx();
    const below = await client.post("/api/media/folders", {
      name: "Sub",
      parentId: writeFolder,
    });
    const at = await client.post("/api/media/folders", {
      name: "Sub",
      parentId: manageFolder,
    });
    expectLevel("create a subfolder", below, at);
    expect(below.status).to.equal(HTTP_FORBIDDEN);
  });

  it("needs the manage right to rename, move and delete a folder, and leaves the refused ones as they were", async () => {
    const {
      client,
      manageFolder,
      manageFolderTwo,
      writeFolder,
      writeFolderTwo,
    } = fx();
    const underWrite = [
      await createFolder(owner, "W a", writeFolder),
      await createFolder(owner, "W b", writeFolder),
      await createFolder(owner, "W c", writeFolder),
    ];
    const underManage = [
      await createFolder(owner, "M a", manageFolder),
      await createFolder(owner, "M b", manageFolder),
      await createFolder(owner, "M c", manageFolder),
    ];
    expectLevel(
      "rename a folder",
      await client.post(`/api/media/folders/${underWrite[0]}/rename`, {
        name: "Renamed",
      }),
      await client.post(`/api/media/folders/${underManage[0]}/rename`, {
        name: "Renamed",
      }),
    );
    expectLevel(
      "move a folder",
      await client.post(`/api/media/folders/${underWrite[1]}/move`, {
        parentId: manageFolderTwo,
      }),
      await client.post(`/api/media/folders/${underManage[1]}/move`, {
        parentId: manageFolderTwo,
      }),
    );
    const intoWrite = await client.post(
      `/api/media/folders/${underManage[2]}/move`,
      { parentId: writeFolderTwo },
    );
    expect(
      isRefused(intoWrite),
      `into a write folder: ${intoWrite.status}`,
    ).to.equal(true);
    expectLevel(
      "delete a folder",
      await client.delete(`/api/media/folders/${underWrite[2]}`),
      await client.delete(`/api/media/folders/${underManage[2]}`),
    );
    const tree = readBody(await owner.get("/api/media/tree"), treeNamesBody);
    const names = new Map(
      tree.folders.map((folder) => [folder.id, folder.name]),
    );
    expect(underWrite.map((id) => names.get(id))).to.deep.equal([
      "W a",
      "W b",
      "W c",
    ]);
  });
}

/** Which right each file and folder route needs: refused one level below, allowed at it. */
export function permissionLevelSuites(): void {
  describe("every route needs its documented right", () => {
    const roots: string[] = [];
    let fixture: LevelFixture;
    const fx = () => fixture;

    before(async () => {
      fixture = await buildLevelFixture(roots);
    });

    after(async () => {
      for (const rootId of roots) {
        await owner.delete(`/api/media/folders/${rootId}`);
      }
    });

    describe("file routes", () => fileRouteTests(fx));
    describe("folder routes", () => folderRouteTests(fx));
  });
}
