import type { AxiosInstance } from "axios";
import axios from "axios";
import { expect } from "chai";
import sharp from "sharp";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const IMAGE_NAME = "banner.png";
const IMAGE_WIDTH = 20;
const IMAGE_HEIGHT = 10;
const TEST_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

async function buildTestImage(): Promise<Buffer> {
  return sharp({
    create: {
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();
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
  const put = await axios.put(presign.data.uploadUrl, body, {
    headers: presign.data.headers,
    validateStatus: () => true,
    transformRequest: [(data) => data],
  });
  expect(put.status).to.be.lessThan(300);
  const confirm = await client.post("/api/media/upload/confirm", {
    folderId,
    resourceKey: presign.data.resourceKey,
    filename,
  });
  expect(confirm.status).to.equal(HTTP_OK);
  return confirm.data.asset.id;
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
    folderId = folder.data.id;
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
