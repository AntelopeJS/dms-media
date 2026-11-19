import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  RegisterAssetBinding,
  UnregisterAssetBinding,
} from "@antelopejs/interface-dms-media";
import { CONTENT_ROOT_BINDING } from "../../bindings";
import { MediaEventModel, MediaFolderModel } from "../../db";
import {
  uploadAsset,
  uploadPixelPng,
  uploadTextAsset,
} from "../helpers/assets";
import { createdBody, readBody } from "../helpers/bodies";
import { fetchFolderNodes } from "../helpers/folders";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import { solidPng } from "../helpers/png";
import { readZip } from "../helpers/zip";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const BINDING_ID = "explorer.linked";
const ERRORS = "$dms_media.errors";
const ALT_LIMIT = 255;
const NAME_LIMIT = 255;
const ZIP_FILE_LIMIT = 200;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const UPLOAD_BATCH = 20;
const NFD_SUMMER = "Été".normalize("NFD");

function textLines(count: number): Buffer {
  return Buffer.from(
    Array.from(
      { length: count },
      (_, index) => `ligne ${index} — été 東京`,
    ).join("\n"),
  );
}

/** Uploads `count` small text files into a folder, a few at a time, and answers their ids. */
async function uploadMany(folderId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let first = 0; first < count; first += UPLOAD_BATCH) {
    const batch = await Promise.all(
      Array.from(
        { length: Math.min(UPLOAD_BATCH, count - first) },
        (_, offset) =>
          uploadAsset(
            client,
            folderId,
            `f${first + offset}.txt`,
            "text/plain",
            Buffer.from(String(first + offset)),
          ),
      ),
    );
    ids.push(...batch.map((asset) => asset.id));
  }
  return ids;
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

let client: AxiosInstance;
let rootId: string;
let otherId: string;

async function folderIdOf(name: string, parentId?: string): Promise<string> {
  const created = await client.post("/api/media/folders", { name, parentId });
  expect(created.status, name).to.equal(HTTP_OK);
  return readBody(created, createdBody).id;
}

async function removeFolder(folderId: string): Promise<void> {
  expect(
    (await client.delete(`/api/media/folders/${folderId}`)).status,
  ).to.equal(HTTP_OK);
}

function describeFolderNames(): void {
  describe("folder names and linked folders", () => {
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

    it("refuses a sibling name taken ignoring case and Unicode form on create, rename and move, and allows it in another folder", async () => {
      const parent = await folderIdOf("Unicode siblings", rootId);
      await folderIdOf("Été", parent);
      for (const name of ["ÉTÉ", NFD_SUMMER]) {
        const twin = await client.post("/api/media/folders", {
          name,
          parentId: parent,
        });
        expect(twin.status, name).to.equal(HTTP_CONFLICT);
        expect(twin.data, name).to.equal(`${ERRORS}.folder_name_taken`);
      }
      const winter = await folderIdOf("Hiver", parent);
      const rename = await client.post(`/api/media/folders/${winter}/rename`, {
        name: "été",
      });
      expect(rename.status).to.equal(HTTP_CONFLICT);
      expect(rename.data).to.equal(`${ERRORS}.folder_name_taken`);
      const elsewhere = await folderIdOf("Été");
      try {
        const move = await client.post(`/api/media/folders/${elsewhere}/move`, {
          parentId: parent,
        });
        expect(move.status).to.equal(HTTP_CONFLICT);
      } finally {
        await removeFolder(elsewhere);
      }
    });

    it("refuses every name Windows or macOS cannot save with an error key, and keeps a name of 255 characters", async () => {
      const forbidden = [
        "a/b",
        "a\\b",
        "a<b",
        "a>b",
        "a:b",
        'a"b',
        "a|b",
        "a?b",
        "a*b",
        "a\u0001b",
        "x".repeat(NAME_LIMIT + 1),
        "   ",
      ];
      for (const name of forbidden) {
        const created = await client.post("/api/media/folders", {
          name,
          parentId: rootId,
        });
        const label = JSON.stringify(name.slice(0, 20));
        expect(created.status, label).to.equal(HTTP_BAD_REQUEST);
        expect(created.data, label).to.match(/^\$dms_media\.errors\./);
      }
      const longest = `${"y".repeat(NAME_LIMIT - " été".length)} été`;
      expect(longest).to.have.length(NAME_LIMIT);
      await folderIdOf(longest, rootId);
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
        targetId: readBody(created, createdBody).id,
      });
    });

    it("puts no subfolder inside a linked folder, by creation or by move", async () => {
      const linked = (await fetchFolderNodes(client)).find(
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
  });
}

function describeFileNames(): void {
  describe("file names and validation errors", () => {
    it("refuses to rename a file to a name its folder already holds, regardless of case", async () => {
      const first = await uploadTextAsset(client, rootId, "notes.txt");
      const second = await uploadTextAsset(client, rootId, "other.txt");
      const clash = await client.post(`/api/media/assets/${second.id}/update`, {
        name: "NOTES.txt",
      });
      expect(clash.status).to.equal(HTTP_CONFLICT);
      expect(clash.data).to.equal(`${ERRORS}.name_taken`);
      const ownCase = await client.post(
        `/api/media/assets/${first.id}/update`,
        {
          name: "Notes.txt",
        },
      );
      expect(ownCase.status).to.equal(HTTP_OK);
      const elsewhere = await uploadPixelPng(client, otherId);
      const sameNameElsewhere = await client.post(
        `/api/media/assets/${elsewhere.id}/update`,
        { name: "notes.txt" },
      );
      expect(sameNameElsewhere.status).to.equal(HTTP_OK);
    });

    it("refuses to move a file onto a name the target folder already holds, regardless of case", async () => {
      const held = await uploadTextAsset(client, otherId, "Report.txt");
      const mover = await uploadTextAsset(client, rootId, "report.txt");
      const moved = await client.post(`/api/media/assets/${mover.id}/move`, {
        folderId: otherId,
      });
      expect(moved.status).to.equal(HTTP_CONFLICT);
      expect(moved.data).to.equal(`${ERRORS}.name_taken`);
      const bulk = await client.post("/api/media/assets/bulk/move", {
        ids: [mover.id],
        folderId: otherId,
      });
      expect(bulk.data.done).to.deep.equal([]);
      expect(bulk.data.refused).to.deep.equal([
        {
          id: mover.id,
          status: HTTP_CONFLICT,
          message: `${ERRORS}.name_taken`,
        },
      ]);
      const detail = await client.get(`/api/media/assets/${mover.id}`);
      expect(detail.data.asset.folderId).to.equal(rootId);
      await client.delete(`/api/media/assets/${held.id}`);
      await client.delete(`/api/media/assets/${mover.id}`);
    });

    it("refuses a file name taken ignoring Unicode form, and reads back a name, an alt and an alt of 255 characters", async () => {
      const folder = await folderIdOf("File names", rootId);
      await uploadTextAsset(client, folder, "Été.txt");
      const file = await uploadTextAsset(client, folder, "a.txt");
      const update = (body: Record<string, string>) =>
        client.post(`/api/media/assets/${file.id}/update`, body);
      const taken = await update({ name: "ÉTÉ.txt" });
      expect(taken.status).to.equal(HTTP_CONFLICT);
      expect(taken.data).to.equal(`${ERRORS}.name_taken`);
      const alt = "Un toit au soleil, 東京";
      expect((await update({ name: "b é.txt", alt })).status).to.equal(HTTP_OK);
      const read = await client.get(`/api/media/assets/${file.id}`);
      expect(read.data.asset).to.include({ name: "b é.txt", alt });
      expect((await update({ alt: "a".repeat(ALT_LIMIT) })).status).to.equal(
        HTTP_OK,
      );
      const longest = await client.get(`/api/media/assets/${file.id}`);
      expect(longest.data.asset.alt).to.have.length(ALT_LIMIT);
    });

    it("refuses a file name Windows or macOS cannot save, like a folder name", async () => {
      const file = await uploadTextAsset(client, rootId, "portable.txt");
      const update = (name: string) =>
        client.post(`/api/media/assets/${file.id}/update`, { name });
      expect((await update("a:b?.txt")).status).to.equal(HTTP_BAD_REQUEST);
      const slash = await update("a/b.txt");
      expect(slash.status).to.equal(HTTP_BAD_REQUEST);
      expect(slash.data).to.equal(`${ERRORS}.name_forbidden`);
      await client.delete(`/api/media/assets/${file.id}`);
    });

    it("answers validation errors with i18n keys instead of zod dumps", async () => {
      const asset = await uploadPixelPng(client, rootId);
      const tooLong = await client.post(
        `/api/media/assets/${asset.id}/update`,
        {
          alt: "x".repeat(ALT_LIMIT + 1),
        },
      );
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
  });
}

function describeZip(): void {
  describe("folder zip", () => {
    it("zips a selection as media.zip and a folder under its own name, every byte of each file kept", async () => {
      const folder = await folderIdOf("Été 2026");
      try {
        const sub = await folderIdOf("Sous-dossier", folder);
        const notes = textLines(20_000);
        const png = await solidPng(30, 30);
        const first = await uploadAsset(
          client,
          folder,
          "notes été.txt",
          "text/plain",
          notes,
        );
        const second = await uploadAsset(
          client,
          sub,
          "image.png",
          "image/png",
          png,
        );
        const selection = await client.post(
          "/api/media/assets/zip",
          { ids: [first.id, second.id] },
          { responseType: "arraybuffer" },
        );
        expect(selection.status).to.equal(HTTP_OK);
        expect(selection.headers["content-type"]).to.match(/^application\/zip/);
        expect(selection.headers["content-disposition"]).to.contain(
          'filename="media.zip"',
        );
        const selected = readZip(readBody(selection, z.instanceof(Buffer)));
        expect(selected.map((entry) => entry.name).sort()).to.deep.equal([
          "image.png",
          "notes été.txt",
        ]);
        expect(
          selected
            .find((entry) => entry.name === "notes été.txt")
            ?.bytes.equals(notes),
        ).to.equal(true);
        expect(
          selected
            .find((entry) => entry.name === "image.png")
            ?.bytes.equals(png),
        ).to.equal(true);

        const whole = await client.post(
          `/api/media/folders/${folder}/zip`,
          undefined,
          { responseType: "arraybuffer" },
        );
        expect(whole.headers["content-disposition"]).to.contain(
          `filename*=UTF-8''${encodeURIComponent("Été 2026.zip")}`,
        );
        const entries = readZip(readBody(whole, z.instanceof(Buffer)));
        expect(entries.map((entry) => entry.name).sort()).to.deep.equal([
          "Sous-dossier/image.png",
          "notes été.txt",
        ]);
        expect(
          entries
            .find((entry) => entry.name === "Sous-dossier/image.png")
            ?.bytes.equals(png),
        ).to.equal(true);
        expect(
          entries
            .find((entry) => entry.name === "notes été.txt")
            ?.bytes.equals(notes),
        ).to.equal(true);
      } finally {
        await removeFolder(folder);
      }
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
      const names = readZip(readBody(zipped, z.instanceof(Buffer))).map(
        (entry) => entry.name,
      );
      expect(names).to.include.members([
        "Notes.txt",
        "other.txt",
        "Other/notes.txt",
      ]);
    });
  });
}

function describeZipLimits(): void {
  describe("zip limits", () => {
    it("zips at most 200 files, and lists 500 files in one page", async function () {
      this.timeout(180_000);
      const many = await folderIdOf("Many files");
      try {
        const ids = await uploadMany(many, ZIP_FILE_LIMIT + 1);
        const zipIds = (selection: string[]) =>
          client.post(
            "/api/media/assets/zip",
            { ids: selection },
            { responseType: "arraybuffer" },
          );
        expect((await zipIds(ids)).status).to.equal(HTTP_PAYLOAD_TOO_LARGE);
        const atMost = await zipIds(ids.slice(0, ZIP_FILE_LIMIT));
        expect(atMost.status).to.equal(HTTP_OK);
        expect(readZip(readBody(atMost, z.instanceof(Buffer)))).to.have.length(
          ZIP_FILE_LIMIT,
        );
        const folderZip = await client.post(
          `/api/media/folders/${many}/zip`,
          undefined,
          { responseType: "arraybuffer" },
        );
        expect(folderZip.status).to.equal(HTTP_PAYLOAD_TOO_LARGE);
        const listing = await client.get(`/api/media/folders/${many}/assets`, {
          params: { limit: 500 },
        });
        expect(listing.data.assets).to.have.length(ZIP_FILE_LIMIT + 1);
      } finally {
        await removeFolder(many);
      }
    });
  });
}

describe("[integration] media explorer writes — names, linked folders, zips", () => {
  before(async () => {
    RegisterAssetBinding({ id: BINDING_ID, folderName: "Explorer linked" });
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    const root = await client.post("/api/media/folders", {
      name: "Explorer writes",
    });
    expect(root.status).to.equal(HTTP_OK);
    rootId = readBody(root, createdBody).id;
    const other = await client.post("/api/media/folders", {
      name: "Other",
      parentId: rootId,
    });
    otherId = readBody(other, createdBody).id;
  });

  after(async () => {
    await client.delete(`/api/media/folders/${rootId}`);
    UnregisterAssetBinding(BINDING_ID);
    await removeLinkedFolders();
  });

  describeFolderNames();
  describeFileNames();
  describeZip();
  describeZipLimits();
});
