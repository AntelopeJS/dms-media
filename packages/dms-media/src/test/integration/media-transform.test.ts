import type { AxiosInstance } from "axios";
import { expect } from "chai";
import sharp from "sharp";
import { z } from "zod";
import { putPresigned } from "../helpers/assets";
import { createdBody, presignBody, readBody } from "../helpers/bodies";
import { follow } from "../helpers/delivery";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const IMAGE_NAME = "banner.png";
const IMAGE_WIDTH = 20;
const IMAGE_HEIGHT = 10;
const TEST_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

function solidImage(width: number, height: number): sharp.Sharp {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  });
}

async function buildTestImage(): Promise<Buffer> {
  return solidImage(IMAGE_WIDTH, IMAGE_HEIGHT).png().toBuffer();
}

async function storedBytes(client: AxiosInstance): Promise<number> {
  const meter = await client.get("/api/media/stats/storage");
  return readBody(meter, z.object({ value: z.number() })).value;
}

async function servedImage(
  path: string,
  token: string,
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const delivered = await follow(path, { Authorization: `Bearer ${token}` });
  const metadata = await sharp(delivered.body).metadata();
  return {
    bytes: delivered.body,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
  };
}

async function uploadAsset(
  client: AxiosInstance,
  folderId: string,
  body: Buffer,
  filename: string,
  mimetype: string,
): Promise<string> {
  const presign = await client.post("/api/media/upload/presign", {
    folderId,
    filename,
    size: body.byteLength,
    mimetype,
  });
  expect(presign.status).to.equal(HTTP_OK);
  const presigned = readBody(presign, presignBody);
  const put = await putPresigned(presigned, body);
  expect(put.status).to.be.lessThan(300);
  const confirm = await client.post("/api/media/upload/confirm", {
    folderId,
    resourceKey: presigned.resourceKey,
    filename,
  });
  expect(confirm.status).to.equal(HTTP_OK);
  return readBody(confirm, z.object({ asset: createdBody })).asset.id;
}

function uploadImage(
  client: AxiosInstance,
  folderId: string,
  body: Buffer,
): Promise<string> {
  return uploadAsset(client, folderId, body, IMAGE_NAME, "image/png");
}

describe("[integration] media transform — crop, rotate, revert", () => {
  let client: AxiosInstance;
  let folderId: string;
  let assetId: string;

  before(async function () {
    this.timeout(40_000);
    const session = await ensureOwnerSession();
    client = authorizedClient(session.accessToken);
    const folder = await client.post("/api/media/folders", {
      name: "Transforms",
    });
    expect(folder.status).to.equal(HTTP_OK);
    folderId = readBody(folder, createdBody).id;
    assetId = await uploadImage(client, folderId, await buildTestImage());
  });

  after(async () => {
    await client.delete(`/api/media/folders/${folderId}`);
  });

  it("uploads with probed source dimensions", async () => {
    const detail = await client.get(`/api/media/assets/${assetId}`);
    expect(detail.data.asset.width).to.equal(IMAGE_WIDTH);
    expect(detail.data.asset.height).to.equal(IMAGE_HEIGHT);
    expect(detail.data.asset.hasOriginal).to.equal(false);
  });

  it("rotates the image server-side and preserves the original", async () => {
    const response = await client.post(
      `/api/media/assets/${assetId}/transform`,
      { rotate: 90 },
    );
    expect(response.status).to.equal(HTTP_OK);
    expect(response.data.asset.width).to.equal(IMAGE_HEIGHT);
    expect(response.data.asset.height).to.equal(IMAGE_WIDTH);
    expect(response.data.asset.hasOriginal).to.equal(true);
  });

  it("crops with normalized coordinates on top of the previous edit", async () => {
    const response = await client.post(
      `/api/media/assets/${assetId}/transform`,
      { crop: { x: 0, y: 0, width: 1, height: 0.5 } },
    );
    expect(response.status).to.equal(HTTP_OK);
    expect(response.data.asset.width).to.equal(IMAGE_HEIGHT);
    expect(response.data.asset.height).to.equal(IMAGE_WIDTH / 2);
    expect(response.data.asset.hasOriginal).to.equal(true);
  });

  it("reverts to the untouched original", async () => {
    const response = await client.post(`/api/media/assets/${assetId}/revert`);
    expect(response.status).to.equal(HTTP_OK);
    expect(response.data.asset.width).to.equal(IMAGE_WIDTH);
    expect(response.data.asset.height).to.equal(IMAGE_HEIGHT);
    expect(response.data.asset.hasOriginal).to.equal(false);

    const again = await client.post(`/api/media/assets/${assetId}/revert`);
    expect(again.status).to.equal(HTTP_CONFLICT);
  });

  it("rejects transforms on non-image assets", async () => {
    const textAssetId = await uploadAsset(
      client,
      folderId,
      Buffer.from("plain text"),
      "note.txt",
      "text/plain",
    );
    const response = await client.post(
      `/api/media/assets/${textAssetId}/transform`,
      { rotate: 90 },
    );
    expect(response.status).to.equal(HTTP_UNPROCESSABLE_ENTITY);
  });

  it("rejects transforms on SVG assets to avoid silent rasterization", async () => {
    const svgAssetId = await uploadAsset(
      client,
      folderId,
      Buffer.from(TEST_SVG),
      "logo.svg",
      "image/svg+xml",
    );
    const response = await client.post(
      `/api/media/assets/${svgAssetId}/transform`,
      { rotate: 90 },
    );
    expect(response.status).to.equal(HTTP_UNPROCESSABLE_ENTITY);
  });

  it("rejects empty or out-of-bounds transform requests", async () => {
    const empty = await client.post(
      `/api/media/assets/${assetId}/transform`,
      {},
    );
    expect(empty.status).to.equal(400);

    const outOfBounds = await client.post(
      `/api/media/assets/${assetId}/transform`,
      { crop: { x: 0.8, y: 0, width: 0.5, height: 0.5 } },
    );
    expect(outOfBounds.status).to.equal(400);
  });

  it("crops a sliver at the far edge without erroring", async () => {
    const response = await client.post(
      `/api/media/assets/${assetId}/transform`,
      { crop: { x: 0.999, y: 0, width: 0.001, height: 1 } },
    );
    expect(response.status).to.equal(HTTP_OK);
    expect(response.data.asset.width).to.be.greaterThan(0);
    await client.post(`/api/media/assets/${assetId}/revert`);
  });
});

describe("[integration] media transform — what the same link serves after an edit", () => {
  let client: AxiosInstance;
  let token: string;
  let folderId: string;

  before(async function () {
    this.timeout(40_000);
    const session = await ensureOwnerSession();
    token = session.accessToken;
    client = authorizedClient(token);
    const folder = await client.post("/api/media/folders", {
      name: "Edit contract",
    });
    expect(folder.status).to.equal(HTTP_OK);
    folderId = readBody(folder, createdBody).id;
  });

  after(async () => {
    await client.delete(`/api/media/folders/${folderId}`);
  });

  it("serves the rotated image on the same link and in its thumb, counts the original in the storage and serves it again on revert", async () => {
    const landscape = await solidImage(400, 200).png().toBuffer();
    const id = await uploadAsset(
      client,
      folderId,
      landscape,
      "paysage.png",
      "image/png",
    );
    const path = `/media/${id}/paysage.png`;
    const thumbPath = `/media/${id}/thumb/paysage.png`;
    const thumbBefore = await servedImage(thumbPath, token);
    const storageBefore = await storedBytes(client);
    const rotated = await client.post(`/api/media/assets/${id}/transform`, {
      rotate: 90,
    });
    expect(rotated.status).to.equal(HTTP_OK);
    expect(rotated.data.asset.hasOriginal).to.equal(true);
    const afterRotate = await servedImage(path, token);
    expect([afterRotate.width, afterRotate.height]).to.deep.equal([200, 400]);
    const thumbAfter = await servedImage(thumbPath, token);
    expect(thumbBefore.width).to.be.greaterThan(thumbBefore.height);
    expect(thumbAfter.height).to.be.greaterThan(thumbAfter.width);
    expect(thumbAfter.bytes.equals(thumbBefore.bytes)).to.equal(false);
    const storageAfter = await storedBytes(client);
    expect(storageAfter).to.be.at.least(storageBefore + landscape.byteLength);
    const cropped = await client.post(`/api/media/assets/${id}/transform`, {
      crop: { x: 0, y: 0, width: 0.5, height: 1 },
    });
    expect(cropped.data.asset.hasOriginal).to.equal(true);
    const afterCrop = await servedImage(path, token);
    expect([afterCrop.width, afterCrop.height]).to.deep.equal([100, 400]);
    const reverted = await client.post(`/api/media/assets/${id}/revert`);
    expect(reverted.status).to.equal(HTTP_OK);
    expect(reverted.data.asset.width).to.equal(400);
    const afterRevert = await servedImage(path, token);
    expect(afterRevert.bytes.equals(landscape)).to.equal(true);
  });

  it("edits JPEG, PNG, WebP and AVIF, turns by quarter steps, and refuses a GIF, a tilt or an empty request without changing the file", async () => {
    const formats = ["jpeg", "png", "webp", "avif"] as const;
    for (const format of formats) {
      const id = await uploadAsset(
        client,
        folderId,
        await solidImage(20, 10).toFormat(format).toBuffer(),
        `x.${format}`,
        `image/${format}`,
      );
      const answer = await client.post(`/api/media/assets/${id}/transform`, {
        rotate: 90,
      });
      expect(answer.status, format).to.equal(HTTP_OK);
      expect(answer.data.asset.width, format).to.equal(10);
    }
    const turned = await uploadAsset(
      client,
      folderId,
      await solidImage(30, 10).png().toBuffer(),
      "t.png",
      "image/png",
    );
    const half = await client.post(`/api/media/assets/${turned}/transform`, {
      rotate: 180,
    });
    expect([half.data.asset.width, half.data.asset.height]).to.deep.equal([
      30, 10,
    ]);
    const threeQuarters = await client.post(
      `/api/media/assets/${turned}/transform`,
      { rotate: 270 },
    );
    expect([
      threeQuarters.data.asset.width,
      threeQuarters.data.asset.height,
    ]).to.deep.equal([10, 30]);
    const gif = await uploadAsset(
      client,
      folderId,
      await solidImage(10, 10).gif().toBuffer(),
      "g.gif",
      "image/gif",
    );
    const gifEdit = await client.post(`/api/media/assets/${gif}/transform`, {
      rotate: 90,
    });
    expect(gifEdit.status).to.equal(HTTP_UNPROCESSABLE_ENTITY);
    const untouched = await uploadAsset(
      client,
      folderId,
      await solidImage(10, 10).png().toBuffer(),
      "p.png",
      "image/png",
    );
    const tilted = await client.post(
      `/api/media/assets/${untouched}/transform`,
      { rotate: 45 },
    );
    expect(tilted.status).to.equal(HTTP_BAD_REQUEST);
    const read = await client.get(`/api/media/assets/${untouched}`);
    expect(read.data.asset.hasOriginal).to.equal(false);
  });
});
