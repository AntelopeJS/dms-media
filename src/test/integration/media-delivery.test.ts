import type { AxiosInstance } from "axios";
import { expect } from "chai";
import {
  ONE_PIXEL_PNG,
  PNG_NAME,
  rawGet,
  uploadPixelPng,
} from "../helpers/assets";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_FOUND = 302;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;

async function fetchBytes(url: string): Promise<Buffer> {
  const response = await fetch(url);
  expect(response.status).to.equal(HTTP_OK);
  return Buffer.from(await response.arrayBuffer());
}

describe("[integration] media delivery — visibility and derivatives", () => {
  let client: AxiosInstance;
  let token: string;
  let folderId: string;
  let assetId: string;

  before(async function () {
    this.timeout(40_000);
    const session = await ensureOwnerSession();
    token = session.accessToken;
    client = authorizedClient(token);
    const folder = await client.post("/api/media/folders", {
      name: "Delivery",
    });
    expect(folder.status).to.equal(HTTP_OK);
    folderId = folder.data.id;
    const asset = await uploadPixelPng(client, folderId);
    assetId = asset.id;
  });

  after(async () => {
    await client.delete(`/api/media/folders/${folderId}`);
  });

  it("extracts image dimensions during upload confirmation", async () => {
    const detail = await client.get(`/api/media/assets/${assetId}`);
    expect(detail.status).to.equal(HTTP_OK);
    expect(detail.data.asset.width).to.equal(1);
    expect(detail.data.asset.height).to.equal(1);
  });

  it("rejects anonymous access to a private asset", async () => {
    const response = await rawGet(`/media/${assetId}/${PNG_NAME}`);
    expect(response.status).to.equal(HTTP_UNAUTHORIZED);
  });

  it("redirects an authorized user to a short-lived signed URL", async () => {
    const response = await rawGet(`/media/${assetId}/${PNG_NAME}`, token);
    expect(response.status).to.equal(HTTP_FOUND);
    expect(response.location).to.be.a("string");
    expect(response.cacheControl).to.equal("no-store");
    const bytes = await fetchBytes(response.location as string);
    expect(bytes.equals(ONE_PIXEL_PNG)).to.equal(true);
  });

  it("serves public assets anonymously with a cacheable redirect", async () => {
    const flip = await client.post(
      `/api/media/folders/${folderId}/visibility`,
      {
        visibility: "public",
      },
    );
    expect(flip.status).to.equal(HTTP_OK);
    const response = await rawGet(`/media/${assetId}/${PNG_NAME}`);
    expect(response.status).to.equal(HTTP_FOUND);
    expect(response.cacheControl).to.equal("public, max-age=3600");
  });

  it("generates a derivative lazily and serves it through the preset route", async () => {
    const response = await rawGet(`/media/${assetId}/thumb/${PNG_NAME}`);
    expect(response.status).to.equal(HTTP_FOUND);
    const bytes = await fetchBytes(response.location as string);
    expect(bytes.byteLength).to.be.greaterThan(0);
    expect(bytes.equals(ONE_PIXEL_PNG)).to.equal(false);

    const again = await rawGet(`/media/${assetId}/thumb/${PNG_NAME}`);
    expect(again.status).to.equal(HTTP_FOUND);
  });

  it("returns 404 for an unknown preset", async () => {
    const response = await rawGet(`/media/${assetId}/nosuchpreset/${PNG_NAME}`);
    expect(response.status).to.equal(HTTP_NOT_FOUND);
  });

  it("provides signed read URLs through the authenticated API", async () => {
    const original = await client.get(`/api/media/assets/${assetId}/read-url`);
    expect(original.status).to.equal(HTTP_OK);
    expect(original.data.url).to.be.a("string");

    const derived = await client.get(
      `/api/media/assets/${assetId}/read-url?preset=thumb`,
    );
    expect(derived.status).to.equal(HTTP_OK);
    const bytes = await fetchBytes(derived.data.url);
    expect(bytes.byteLength).to.be.greaterThan(0);
  });

  it("lists all readable assets and returns batched previews", async () => {
    const listing = await client.get("/api/media/assets");
    expect(listing.status).to.equal(HTTP_OK);
    expect(listing.data.truncated).to.equal(false);
    const ids = listing.data.assets.map((asset: { id: string }) => asset.id);
    expect(ids).to.include(assetId);

    const previews = await client.post("/api/media/previews", {
      ids: [assetId, "unknown-asset"],
    });
    expect(previews.status).to.equal(HTTP_OK);
    expect(previews.data.previews[assetId]).to.be.a("string");
    expect(previews.data.previews["unknown-asset"]).to.equal(undefined);
  });

  it("returns to private after flipping the folder back", async () => {
    const flip = await client.post(
      `/api/media/folders/${folderId}/visibility`,
      {
        visibility: "private",
      },
    );
    expect(flip.status).to.equal(HTTP_OK);
    const response = await rawGet(`/media/${assetId}/${PNG_NAME}`);
    expect(response.status).to.equal(HTTP_UNAUTHORIZED);
  });
});
