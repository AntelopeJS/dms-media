import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  RegisterAssetBinding,
  UnregisterAssetBinding,
} from "@antelopejs/interface-dms-media";
import { CONTENT_ROOT_BINDING } from "../../bindings";
import { MediaEventModel, MediaFolderModel } from "../../db";
import { uploadPixelPng, uploadTextAsset } from "../helpers/assets";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const BINDING_ID = "explorer.linked";
const ERRORS = "$dms_media.errors";
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const CENTRAL_NAME_LENGTH_OFFSET = 28;
const CENTRAL_EXTRA_LENGTH_OFFSET = 30;
const CENTRAL_COMMENT_LENGTH_OFFSET = 32;
const CENTRAL_HEADER_SIZE = 46;
const ALT_LIMIT = 255;

interface FolderNode {
  id: string;
  binding: string | null;
}

/** The entry names of a zip, read from its central directory. */
function zipEntryNames(zip: Buffer): string[] {
  const names: string[] = [];
  let offset = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  while (
    offset >= 0 &&
    zip.readUInt32LE(offset) === CENTRAL_DIRECTORY_SIGNATURE
  ) {
    const nameLength = zip.readUInt16LE(offset + CENTRAL_NAME_LENGTH_OFFSET);
    const extraLength = zip.readUInt16LE(offset + CENTRAL_EXTRA_LENGTH_OFFSET);
    const commentLength = zip.readUInt16LE(
      offset + CENTRAL_COMMENT_LENGTH_OFFSET,
    );
    const start = offset + CENTRAL_HEADER_SIZE;
    names.push(zip.subarray(start, start + nameLength).toString("utf8"));
    offset = start + nameLength + extraLength + commentLength;
  }
  return names;
}

async function removeLinkedFolders(): Promise<void> {
  const folderModel = GetModel(MediaFolderModel, DEFAULT_TENANT_ID);
  const linked = await folderModel.getBy("binding", BINDING_ID);
  await Promise.all(linked.map((folder) => folderModel.delete(folder._id)));
  const [contentRoot] = await folderModel.getBy(
    "binding",
    CONTENT_ROOT_BINDING,
  );
  if (!contentRoot) return;
  const children = await folderModel.getBy("parentId", contentRoot._id);
  if (children.length === 0) await folderModel.delete(contentRoot._id);
}

describe("[integration] media explorer writes — names, linked folders, zips", () => {
  let client: AxiosInstance;
  let rootId: string;
  let otherId: string;

  before(async () => {
    RegisterAssetBinding({ id: BINDING_ID, folderName: "Explorer linked" });
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    const root = await client.post("/api/media/folders", {
      name: "Explorer writes",
    });
    expect(root.status).to.equal(HTTP_OK);
    rootId = root.data.id;
    const other = await client.post("/api/media/folders", {
      name: "Other",
      parentId: rootId,
    });
    otherId = other.data.id;
  });

  after(async () => {
    await client.delete(`/api/media/folders/${rootId}`);
    UnregisterAssetBinding(BINDING_ID);
    await removeLinkedFolders();
  });

  it("refuses a sibling folder name whatever its case, with a translatable message", async () => {
    const duplicate = await client.post("/api/media/folders", {
      name: "  other ",
      parentId: rootId,
    });
    expect(duplicate.status).to.equal(HTTP_CONFLICT);
    expect(duplicate.data).to.equal(`${ERRORS}.folder_name_taken`);
  });

  it("refuses names Windows can't save and says why", async () => {
    const created = await client.post("/api/media/folders", {
      name: "a:b",
      parentId: rootId,
    });
    expect(created.status).to.equal(HTTP_BAD_REQUEST);
    expect(created.data).to.equal(`${ERRORS}.name_forbidden`);
  });

  it("records the created folder's id on its activity event", async () => {
    const created = await client.post("/api/media/folders", {
      name: "Traced",
      parentId: rootId,
    });
    const events = await GetModel(MediaEventModel, DEFAULT_TENANT_ID).getBy(
      "kind",
      "folder.create",
    );
    const event = events.find((entry) => entry.targetName === "Traced");
    expect(event?.folderId).to.equal(rootId);
    expect(JSON.parse(event?.json_details ?? "{}")).to.deep.equal({
      targetId: created.data.id,
    });
  });

  it("puts no subfolder inside a linked folder, by creation or by move", async () => {
    const tree = await client.get("/api/media/tree");
    const linked = (tree.data.folders as FolderNode[]).find(
      (folder) => folder.binding === BINDING_ID,
    );
    expect(linked, "linked folder").to.not.equal(undefined);
    const created = await client.post("/api/media/folders", {
      name: "Inside",
      parentId: linked!.id,
    });
    expect(created.status).to.equal(HTTP_FORBIDDEN);
    expect(created.data).to.equal(`${ERRORS}.bound_parent`);
    const moved = await client.post(`/api/media/folders/${otherId}/move`, {
      parentId: linked!.id,
    });
    expect(moved.status).to.equal(HTTP_FORBIDDEN);
  });

  it("refuses to rename a file to a name its folder already holds, regardless of case", async () => {
    const first = await uploadTextAsset(client, rootId, "notes.txt");
    const second = await uploadTextAsset(client, rootId, "other.txt");
    const clash = await client.post(`/api/media/assets/${second.id}/update`, {
      name: "NOTES.txt",
    });
    expect(clash.status).to.equal(HTTP_CONFLICT);
    expect(clash.data).to.equal(`${ERRORS}.name_taken`);
    const ownCase = await client.post(`/api/media/assets/${first.id}/update`, {
      name: "Notes.txt",
    });
    expect(ownCase.status).to.equal(HTTP_OK);
    const elsewhere = await uploadPixelPng(client, otherId);
    const sameNameElsewhere = await client.post(
      `/api/media/assets/${elsewhere.id}/update`,
      { name: "notes.txt" },
    );
    expect(sameNameElsewhere.status).to.equal(HTTP_OK);
  });

  it("answers validation errors with i18n keys instead of zod dumps", async () => {
    const asset = await uploadPixelPng(client, rootId);
    const tooLong = await client.post(`/api/media/assets/${asset.id}/update`, {
      alt: "x".repeat(ALT_LIMIT + 1),
    });
    expect(tooLong.status).to.equal(HTTP_BAD_REQUEST);
    expect(tooLong.data).to.equal(`${ERRORS}.alt_too_long`);
    const forbidden = await client.post(
      `/api/media/assets/${asset.id}/update`,
      {
        name: 'say "hi"?.png',
      },
    );
    expect(forbidden.data).to.equal(`${ERRORS}.name_forbidden`);
    const missing = await client.post("/api/media/assets/missing/update", {
      name: "x.png",
    });
    expect(missing.status).to.equal(HTTP_NOT_FOUND);
    expect(missing.data).to.equal(`${ERRORS}.asset_not_found`);
  });

  it("zips a folder with its subfolders under portable names", async () => {
    const zipped = await client.post(
      `/api/media/folders/${rootId}/zip`,
      undefined,
      {
        responseType: "arraybuffer",
      },
    );
    expect(zipped.status).to.equal(HTTP_OK);
    expect(zipped.headers["content-disposition"]).to.contain(
      "Explorer writes.zip",
    );
    const names = zipEntryNames(Buffer.from(zipped.data));
    expect(names).to.include.members([
      "Notes.txt",
      "other.txt",
      "Other/notes.txt",
    ]);
  });
});
