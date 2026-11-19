import type { AxiosInstance } from "axios";
import { expect } from "chai";
import sharp from "sharp";
import { z } from "zod";
import { configureMediaModule, type DmsMediaConfig } from "../../config";
import { uploadAsset, uploadAssetInBatch } from "../helpers/assets";
import { createdBody, readBody } from "../helpers/bodies";
import { snapshotConfig } from "../helpers/config";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import { confirm, expectRefusal, stage } from "../helpers/uploads";

const HTTP_OK = 200;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const DEFAULT_TYPES = [
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "application/pdf",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "audio/wav",
  "video/quicktime",
  "application/rtf",
  "text/plain",
  "text/markdown",
  "text/csv",
];

const batchesBody = z.object({
  results: z.array(
    z.object({
      _id: z.string(),
      folder: z.string(),
      folderId: z.string(),
      files: z.number(),
      failed: z.number(),
      size: z.number(),
      result: z.string(),
      resultDetail: z.unknown(),
      attention: z.string(),
      finishedAt: z.string(),
    }),
  ),
});

let client: AxiosInstance;
let folderId: string;
let initialConfig: DmsMediaConfig;

async function scratchFolder(name: string): Promise<string> {
  const created = await client.post("/api/media/folders", { name });
  expect(created.status).to.equal(HTTP_OK);
  return readBody(created, createdBody).id;
}

function jpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 4, height: 4, channels: 3, background: "#808080" },
  })
    .jpeg()
    .toBuffer();
}

function describeTypes(): void {
  describe("accepted types", () => {
    it("active-documents-are-refused-by-type-or-extension: an executable type is refused with a message, and a default type is stored through confirm", async () => {
      const refused = await client.post("/api/media/upload/presign", {
        folderId,
        filename: "tool.exe",
        size: 8,
        mimetype: "application/x-msdownload",
      });
      expectRefusal(
        refused,
        { status: HTTP_UNSUPPORTED_MEDIA_TYPE, reason: "type_not_allowed" },
        "tool.exe",
      );
      const staged = await stage(client, folderId, {
        filename: "notes.md",
        mimetype: "text/markdown",
        body: Buffer.from("# Notes\n"),
      });
      const stored = await confirm(
        client,
        folderId,
        staged.resourceKey,
        "notes.md",
      );
      expect(stored.status).to.equal(HTTP_OK);
    });

    it("allowed-mimetypes-match-a-prefix-and-confirm-checks-again: every default type is stored through confirm and image/* stores a WebP", async () => {
      for (const [index, mimetype] of DEFAULT_TYPES.entries()) {
        const filename = `default-${index}.bin`;
        const staged = await stage(client, folderId, {
          filename,
          mimetype,
          body: Buffer.from(`file ${index}`),
        });
        const stored = await confirm(
          client,
          folderId,
          staged.resourceKey,
          filename,
        );
        expect(stored.status, mimetype).to.equal(HTTP_OK);
      }
      configureMediaModule({ ...initialConfig, allowedMimetypes: ["image/*"] });
      const webp = await uploadAsset(
        client,
        folderId,
        "a.webp",
        "image/webp",
        await sharp({
          create: { width: 4, height: 4, channels: 3, background: "#808080" },
        })
          .webp()
          .toBuffer(),
      );
      expect(webp.id).to.not.equal("");
    });
  });
}

function describeNames(): void {
  describe("free names", () => {
    it("keep-both-names-add-a-number: a taken name, whose own (2) is taken in another case, gets (3)", async () => {
      const folder = await scratchFolder("Uploads journeys names");
      try {
        await uploadAsset(
          client,
          folder,
          "photo.jpg",
          "image/jpeg",
          await jpeg(),
        );
        await uploadAsset(
          client,
          folder,
          "Photo (2).JPG",
          "image/jpeg",
          await jpeg(),
        );
        const answer = await client.post("/api/media/upload/names", {
          folderId: folder,
          filenames: ["PHOTO.jpg", "new.jpg", "été.png"],
        });
        expect(answer.status).to.equal(HTTP_OK);
        expect(answer.data.names).to.deep.equal(["PHOTO (3).jpg", null, null]);
      } finally {
        await client.delete(`/api/media/folders/${folder}`);
      }
    });
  });
}

function describeBatches(): void {
  describe("recorded batches", () => {
    it("batches-are-recorded-and-listed: a listed batch with a failure keeps its folder, counts, size, refused file, finish time and a flag for attention", async () => {
      const folderName = "Uploads journeys batches";
      const folder = await scratchFolder(folderName);
      try {
        const batchId = "uploads-journeys-batch";
        await uploadAssetInBatch(client, folder, {
          filename: "one.txt",
          mimetype: "text/plain",
          body: Buffer.from("1"),
          batchId,
        });
        const report = await client.post("/api/media/upload/batches", {
          batchId,
          folderId: folder,
          total: 2,
          uploaded: 1,
          failed: 1,
          size: 1,
          failures: [{ name: "two.html", reason: "type_not_allowed" }],
        });
        expect(report.status).to.equal(HTTP_OK);
        const batches = await client.get("/api/media/upload/batches");
        const row = readBody(batches, batchesBody).results.find(
          (entry) => entry._id === batchId,
        );
        expect(row, "the recorded batch").to.not.equal(undefined);
        expect([row?.folder, row?.folderId]).to.deep.equal([
          folderName,
          folder,
        ]);
        expect([row?.files, row?.failed, row?.size]).to.deep.equal([1, 1, 1]);
        expect(row?.result).to.equal("partial");
        expect(JSON.stringify(row?.resultDetail)).to.contain("two.html");
        expect(row?.attention).to.equal("yes");
        expect(row?.finishedAt).to.not.equal("");
      } finally {
        await client.delete(`/api/media/folders/${folder}`);
      }
    });
  });
}

describe("[integration] uploads journeys — accepted types, free names and recorded batches", () => {
  before(async function () {
    this.timeout(40_000);
    initialConfig = snapshotConfig();
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    folderId = await scratchFolder("Uploads journeys");
  });

  after(async () => {
    configureMediaModule(initialConfig);
    await client.delete(`/api/media/folders/${folderId}`);
  });

  afterEach(() => {
    configureMediaModule(initialConfig);
  });

  describeTypes();
  describeNames();
  describeBatches();
});
