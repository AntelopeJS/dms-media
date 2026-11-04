import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import sharp from "sharp";
import { rawGet, uploadAsset } from "../helpers/assets";
import { createdBody, readBody } from "../helpers/bodies";
import { authorizedClient, getBaseUrl } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_FOUND = 302;
const STORAGE_PATH_PREFIX = "/file-storage/";
const THUMB_WIDTH = 300;
const PHOTO_NAME = "wide.png";
const PHOTO_WIDTH = 640;
const PHOTO_HEIGHT = 320;
const SVG_NAME = "badge.svg";
const SVG_SOURCE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#0a7"/></svg>';

function widePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: PHOTO_WIDTH,
      height: PHOTO_HEIGHT,
      channels: 3,
      background: { r: 0, g: 120, b: 200 },
    },
  })
    .png()
    .toBuffer();
}

function requestUrl(input: Parameters<typeof fetch>[0]): URL {
  if (input instanceof Request) return new URL(input.url);
  return new URL(input);
}

/**
 * A backend behind a private network or an egress policy cannot call the
 * storage's public URL (here the API's own /file-storage routes). Clients still
 * reach it, as a browser does through the dashboard; only the server's fetch
 * is cut, so every server-side read and write must go through the storage
 * interface.
 */
describe("[integration] media when the server cannot reach the storage's public URL", () => {
  const serverFetch = globalThis.fetch;
  let client: AxiosInstance;
  let token: string;
  let folderId: string;

  before(async function () {
    this.timeout(40_000);
    const session = await ensureOwnerSession();
    token = session.accessToken;
    client = authorizedClient(token);
    const folder = await client.post("/api/media/folders", {
      name: "Unreachable storage origin",
    });
    expect(folder.status).to.equal(HTTP_OK);
    folderId = readBody(folder, createdBody).id;
    globalThis.fetch = (input, init) =>
      requestUrl(input).pathname.startsWith(STORAGE_PATH_PREFIX)
        ? Promise.reject(new TypeError("fetch failed: egress blocked"))
        : serverFetch(input, init);
  });

  after(async () => {
    globalThis.fetch = serverFetch;
    await client.delete(`/api/media/folders/${folderId}`);
  });

  it("reads an uploaded image's size at confirmation and renders its thumbnail", async () => {
    const asset = await uploadAsset(
      client,
      folderId,
      PHOTO_NAME,
      "image/png",
      await widePng(),
    );
    expect(asset.width).to.equal(PHOTO_WIDTH);
    expect(asset.height).to.equal(PHOTO_HEIGHT);

    const thumb = await rawGet(`/media/${asset.id}/thumb/${PHOTO_NAME}`, token);
    expect(thumb.status).to.equal(HTTP_FOUND);
    assert.isNotNull(thumb.location);
    const stored = await serverFetch(thumb.location);
    expect(stored.status).to.equal(HTTP_OK);
    const metadata = await sharp(
      Buffer.from(await stored.arrayBuffer()),
    ).metadata();
    expect(metadata.width).to.equal(THUMB_WIDTH);
  });

  it("streams an SVG through the API", async () => {
    const asset = await uploadAsset(
      client,
      folderId,
      SVG_NAME,
      "image/svg+xml",
      Buffer.from(SVG_SOURCE),
    );
    const response = await serverFetch(
      `${getBaseUrl()}/media/${asset.id}/${SVG_NAME}`,
      { headers: { Authorization: `Bearer ${token}` }, redirect: "manual" },
    );
    expect(response.status).to.equal(HTTP_OK);
    expect(response.headers.get("content-length")).to.equal(
      String(Buffer.byteLength(SVG_SOURCE)),
    );
    expect(await response.text()).to.equal(SVG_SOURCE);
  });
});
