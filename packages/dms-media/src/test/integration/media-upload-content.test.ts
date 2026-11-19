import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import { FileExists } from "@antelopejs/interface-file-storage";
import sharp from "sharp";
import { z } from "zod";
import { putPresigned } from "../helpers/assets";
import { createdBody, presignBody, readBody, urlBody } from "../helpers/bodies";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import { confirm, expectRefusal, presign, stage } from "../helpers/uploads";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const HTTP_REDIRECT_BOUNDARY = 300;
const STAGING_PREFIX = "__staging__/";
const STORAGE_UPLOAD_PATH = "/file-storage/upload/";
const LONG_TEXT_LINES = 60_000;
const JPEG_WIDTH = 10;
const JPEG_HEIGHT = 6;
const BROKEN_IMAGE_FORMATS = ["png", "jpeg", "webp", "gif", "avif", "tiff"];

const confirmedBody = z.object({
  asset: z.object({
    mimetype: z.string(),
    width: z.number().nullish(),
    height: z.number().nullish(),
  }),
});
const listedBody = z.object({
  assets: z.array(
    z.object({ id: z.string(), name: z.string(), size: z.number() }),
  ),
});

let client: AxiosInstance;
let folderId: string;

function describeDecoding(): void {
  describe("a declared image must decode", () => {
    it("refuses a broken image of each decodable format and deletes its staged file", async () => {
      for (const format of BROKEN_IMAGE_FORMATS) {
        const filename = `broken.${format}`;
        const staged = await stage(client, folderId, {
          filename,
          mimetype: `image/${format}`,
          body: Buffer.from("not an image at all"),
        });
        const response = await confirm(
          client,
          folderId,
          staged.resourceKey,
          filename,
        );
        expectRefusal(
          response,
          { status: HTTP_UNPROCESSABLE_ENTITY, reason: "invalid_image" },
          format,
        );
        expect(await FileExists(staged.resourceKey), format).to.equal(false);
      }
    });

    it("stores the decoded type of a JPEG declared as PNG, and accepts a BMP sharp does not decode", async () => {
      const jpeg = await sharp({
        create: {
          width: JPEG_WIDTH,
          height: JPEG_HEIGHT,
          channels: 3,
          background: "#808080",
        },
      })
        .jpeg()
        .toBuffer();
      const claimed = await stage(client, folderId, {
        filename: "photo.png",
        mimetype: "image/png",
        body: jpeg,
      });
      const stored = await confirm(
        client,
        folderId,
        claimed.resourceKey,
        "photo.png",
      );
      expect(stored.status).to.equal(HTTP_OK);
      const { asset } = readBody(stored, confirmedBody);
      expect(asset.mimetype).to.equal("image/jpeg");
      expect([asset.width, asset.height]).to.deep.equal([
        JPEG_WIDTH,
        JPEG_HEIGHT,
      ]);
      const bmp = await stage(client, folderId, {
        filename: "old.bmp",
        mimetype: "image/bmp",
        body: Buffer.from("BM not decoded"),
      });
      const accepted = await confirm(
        client,
        folderId,
        bmp.resourceKey,
        "old.bmp",
      );
      expect(accepted.status).to.equal(HTTP_OK);
      expect(readBody(accepted, confirmedBody).asset.mimetype).to.equal(
        "image/bmp",
      );
    });
  });
}

function describeThreeSteps(): void {
  describe("the three steps of an upload", () => {
    it("keeps every byte and the non-ASCII name of a multi-chunk upload, staged on the storage's own origin", async () => {
      const name = "Rapport annuel — été 2026 (東京).txt";
      const bytes = Buffer.from(
        Array.from(
          { length: LONG_TEXT_LINES },
          (_, line) => `ligne ${line} — été 東京\n`,
        ).join(""),
      );
      const presigned = await presign(
        client,
        folderId,
        name,
        "text/plain",
        bytes.byteLength,
      );
      const target = readBody(presigned, presignBody);
      expect(target.resourceKey.startsWith(STAGING_PREFIX)).to.equal(true);
      expect(target.uploadUrl).to.contain(STORAGE_UPLOAD_PATH);
      expect(target.uploadUrl).to.not.contain("/api/media");
      const put = await putPresigned(target, bytes);
      expect(put.status).to.be.lessThan(HTTP_REDIRECT_BOUNDARY);
      const done = await confirm(client, folderId, target.resourceKey, name);
      expect(done.status).to.equal(HTTP_OK);
      const listing = await client.get(`/api/media/folders/${folderId}/assets`);
      const listed = readBody(listing, listedBody).assets.find(
        (asset) => asset.name === name,
      );
      assert.isDefined(listed);
      expect(listed.size).to.equal(bytes.byteLength);
      const url = await client.get(`/api/media/assets/${listed.id}/read-url`);
      const read = await fetch(readBody(url, urlBody).url);
      expect(Buffer.from(await read.arrayBuffer()).equals(bytes)).to.equal(
        true,
      );
    });

    it("confirms a key only in the folder it was presigned for", async () => {
      const staged = await stage(client, folderId, {
        filename: "other.txt",
        mimetype: "text/plain",
        body: Buffer.from("x"),
      });
      const elsewhere = readBody(
        await client.post("/api/media/folders", { name: "Elsewhere" }),
        createdBody,
      ).id;
      try {
        const wrong = await confirm(
          client,
          elsewhere,
          staged.resourceKey,
          "other.txt",
        );
        expect(wrong.status).to.equal(HTTP_BAD_REQUEST);
      } finally {
        await client.delete(`/api/media/folders/${elsewhere}`);
      }
    });
  });
}

describe("[integration] media upload content — decoding and the three steps", () => {
  before(async function () {
    this.timeout(40_000);
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    const folder = await client.post("/api/media/folders", {
      name: "Upload content",
    });
    expect(folder.status).to.equal(HTTP_OK);
    folderId = readBody(folder, createdBody).id;
  });

  after(async () => {
    await client.delete(`/api/media/folders/${folderId}`);
  });

  describeDecoding();
  describeThreeSteps();
});
