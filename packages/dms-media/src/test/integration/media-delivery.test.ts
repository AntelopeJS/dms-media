import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import { z } from "zod";
import sharp from "sharp";
import {
  ONE_PIXEL_PNG,
  PNG_NAME,
  rawGet,
  uploadAsset,
  uploadPixelPng,
} from "../helpers/assets";
import { createdBody, readBody, urlBody } from "../helpers/bodies";
import { deliver, longText, signedLifetimeSeconds } from "../helpers/delivery";
import { authorizedClient, getBaseUrl } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_FOUND = 302;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;

interface PreviewResponse {
  previews: Record<string, string>;
}

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
    folderId = readBody(folder, createdBody).id;
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

  it("refuses an anonymous caller before telling whether a preset exists", async () => {
    const known = await rawGet(`/media/${assetId}/thumb/${PNG_NAME}`);
    const unknown = await rawGet(`/media/${assetId}/nosuchpreset/${PNG_NAME}`);
    expect(known.status).to.equal(HTTP_UNAUTHORIZED);
    expect(unknown.status).to.equal(HTTP_UNAUTHORIZED);
  });

  it("redirects an authorized user to a short-lived signed URL", async () => {
    const response = await rawGet(`/media/${assetId}/${PNG_NAME}`, token);
    expect(response.status).to.equal(HTTP_FOUND);
    assert.isNotNull(response.location);
    expect(response.cacheControl).to.equal("no-store");
    const bytes = await fetchBytes(response.location);
    expect(bytes.equals(ONE_PIXEL_PNG)).to.equal(true);
  });

  it("serves public assets anonymously with a redirect revalidated on every use", async () => {
    const flip = await client.post(
      `/api/media/folders/${folderId}/visibility`,
      {
        visibility: "public",
      },
    );
    expect(flip.status).to.equal(HTTP_OK);
    const response = await rawGet(`/media/${assetId}/${PNG_NAME}`);
    expect(response.status).to.equal(HTTP_FOUND);
    expect(response.cacheControl).to.equal("no-cache");
  });

  it("generates a derivative lazily and serves it through the preset route", async () => {
    const response = await rawGet(`/media/${assetId}/thumb/${PNG_NAME}`);
    expect(response.status).to.equal(HTTP_FOUND);
    assert.isNotNull(response.location);
    const bytes = await fetchBytes(response.location);
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
    const bytes = await fetchBytes(readBody(derived, urlBody).url);
    expect(bytes.byteLength).to.be.greaterThan(0);
  });

  it("lists all readable assets and returns batched previews", async () => {
    const listing = await client.get("/api/media/assets");
    expect(listing.status).to.equal(HTTP_OK);
    expect(listing.data.truncated).to.equal(false);
    const ids = readBody(
      listing,
      z.object({ assets: z.array(createdBody) }),
    ).assets.map((asset) => asset.id);
    expect(ids).to.include(assetId);

    const secondAsset = await uploadPixelPng(client, folderId);
    const previews = await client.get<PreviewResponse>(
      `/api/media/previews?ids=${assetId}&ids=${secondAsset.id}`,
    );
    expect(previews.status).to.equal(HTTP_OK);
    expect(Object.keys(previews.data.previews)).to.have.members([
      assetId,
      secondAsset.id,
    ]);
    expect(previews.data.previews[assetId]).to.be.a("string");
    expect(previews.data.previews[secondAsset.id]).to.be.a("string");
    const legacy = await client.post("/api/media/previews", {
      ids: [assetId, secondAsset.id],
    });
    expect(legacy.status).to.equal(HTTP_NOT_FOUND);
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

const PRIVATE_SIGNED_MAX_SECONDS = 300;
const PRIVATE_SIGNED_MIN_SECONDS = 150;
const PUBLIC_SIGNED_MAX_SECONDS = 3600;
const PUBLIC_SIGNED_MIN_SECONDS = 1800;
const BINARY_BYTES = 3 * 1024 * 1024;
const TEXT_LINES = 4000;
const FOREIGN_ORIGIN = "https://site.example.org";
const RENAMED = "après été.png";

let contractClient: AxiosInstance;
let contractToken = "";
function asOwner() {
  return { Authorization: `Bearer ${contractToken}` };
}

const contractFolderIds: string[] = [];

async function newFolder(name: string): Promise<string> {
  const response = await contractClient.post("/api/media/folders", { name });
  expect(response.status).to.equal(HTTP_OK);
  const { id } = readBody(response, createdBody);
  contractFolderIds.push(id);
  return id;
}

async function setVisibility(
  kind: "folders" | "assets",
  id: string,
  visibility: string,
): Promise<void> {
  const response = await contractClient.post(
    `/api/media/${kind}/${id}/visibility`,
    { visibility },
  );
  expect(response.status).to.equal(HTTP_OK);
}

function solidPng(width: number): Promise<Buffer> {
  return sharp({
    create: { width, height: width, channels: 3, background: "#3366cc" },
  })
    .png()
    .toBuffer();
}

function linkOf(asset: { id: string; name: string }): string {
  return `/media/${asset.id}/${encodeURIComponent(asset.name)}`;
}

function describeLinkAnswers(): void {
  describe("what a link answers", () => {
    it("redirects a public file to a signed URL that serves every byte, and keeps the CORS answer of an allowed origin", async () => {
      const folderId = await newFolder("Public bytes");
      const bytes = Buffer.from(
        Array.from(
          { length: BINARY_BYTES },
          (_, index) => (index * 31 + (index >> 11)) % 256,
        ),
      );
      const file = await uploadAsset(
        contractClient,
        folderId,
        "Données été 東京.bin",
        "application/pdf",
        bytes,
      );
      await setVisibility("folders", folderId, "public");
      const anonymous = await deliver(linkOf(file), {
        Origin: FOREIGN_ORIGIN,
      });
      expect(anonymous.status).to.equal(HTTP_FOUND);
      expect(anonymous.headers.get("cache-control")).to.equal("no-cache");
      expect(anonymous.headers.get("access-control-allow-origin")).to.equal(
        "*",
      );
      const location = anonymous.headers.get("location") ?? "";
      expect(location).to.not.contain("/media/");
      expect((await fetchBytes(location)).equals(bytes)).to.equal(true);
      const allowed = await deliver(linkOf(file), { Origin: getBaseUrl() });
      expect(allowed.headers.get("access-control-allow-origin")).to.equal(
        getBaseUrl(),
      );
      expect(allowed.headers.get("cache-control")).to.equal("no-cache");
    });

    it("keeps a private file behind its reader: no open CORS answer, no HTML for a script, the same text bytes", async () => {
      const folderId = await newFolder("Private text");
      const bytes = longText(TEXT_LINES);
      const file = await uploadAsset(
        contractClient,
        folderId,
        "notes privées.txt",
        "text/plain",
        bytes,
      );
      const script = await deliver(linkOf(file), {
        Accept: "application/json",
      });
      expect(script.status).to.equal(HTTP_UNAUTHORIZED);
      expect(script.body.toString()).to.not.contain("<html");
      const owner = await deliver(linkOf(file), asOwner());
      expect(owner.status).to.equal(HTTP_FOUND);
      expect(owner.headers.get("cache-control")).to.equal("no-store");
      expect(owner.headers.get("access-control-allow-origin")).to.not.equal(
        "*",
      );
      const stored = await fetchBytes(owner.headers.get("location") ?? "");
      expect(stored.equals(bytes)).to.equal(true);
    });

    it("redirects a stale file name to the canonical link after a rename and refuses a link without a name", async () => {
      const folderId = await newFolder("Stale names");
      const file = await uploadAsset(
        contractClient,
        folderId,
        "avant.png",
        "image/png",
        await solidPng(8),
      );
      const rename = await contractClient.post(
        `/api/media/assets/${file.id}/update`,
        { name: RENAMED },
      );
      expect(rename.status).to.equal(HTTP_OK);
      const canonical = `/media/${file.id}/${encodeURIComponent(RENAMED)}`;
      const old = await deliver(linkOf(file), asOwner());
      expect(old.status).to.equal(HTTP_FOUND);
      expect(old.headers.get("location")).to.equal(canonical);
      expect(old.headers.get("cache-control")).to.equal("no-cache");
      const current = await deliver(canonical, asOwner());
      expect(current.status).to.equal(HTTP_FOUND);
      expect(current.headers.get("location")).to.contain("/file-storage/");
      const nameless = await deliver(`/media/${file.id}/`, asOwner());
      expect(nameless.status).to.equal(HTTP_NOT_FOUND);
      const unknown = await deliver("/media/no-such-asset/x.png", asOwner());
      expect(unknown.status).to.equal(HTTP_NOT_FOUND);
    });
  });
}

function describeLinkLifetimes(): void {
  describe("how long a link's signed URL lives", () => {
    it("signs a private file's URL for five minutes and a public one's for an hour", async () => {
      const folderId = await newFolder("Signed lifetimes");
      const file = await uploadAsset(
        contractClient,
        folderId,
        "signed.png",
        "image/png",
        await solidPng(8),
      );
      const first = await deliver(linkOf(file), asOwner());
      const second = await deliver(linkOf(file), asOwner());
      const privateUrl = first.headers.get("location") ?? "";
      expect(second.headers.get("location")).to.equal(privateUrl);
      expect(await signedLifetimeSeconds(privateUrl)).to.be.within(
        PRIVATE_SIGNED_MIN_SECONDS + 1,
        PRIVATE_SIGNED_MAX_SECONDS,
      );
      await setVisibility("assets", file.id, "public");
      const open = await deliver(linkOf(file));
      const publicUrl = open.headers.get("location") ?? "";
      expect(publicUrl).to.not.equal(privateUrl);
      expect(await signedLifetimeSeconds(publicUrl)).to.be.within(
        PUBLIC_SIGNED_MIN_SECONDS + 1,
        PUBLIC_SIGNED_MAX_SECONDS,
      );
    });

    it("takes the file's visibility, else its folder's, else private, and never changes the link", async () => {
      const folderId = await newFolder("Visibility order");
      const file = await uploadAsset(
        contractClient,
        folderId,
        "vis.png",
        "image/png",
        await solidPng(8),
      );
      const anonymousStatus = async (): Promise<number> =>
        (await deliver(linkOf(file))).status;
      expect(await anonymousStatus()).to.equal(HTTP_UNAUTHORIZED);
      await setVisibility("folders", folderId, "public");
      expect(await anonymousStatus()).to.equal(HTTP_FOUND);
      await setVisibility("assets", file.id, "private");
      expect(await anonymousStatus()).to.equal(HTTP_UNAUTHORIZED);
      await setVisibility("folders", folderId, "private");
      await setVisibility("assets", file.id, "public");
      expect(await anonymousStatus()).to.equal(HTTP_FOUND);
      await setVisibility("assets", file.id, "inherit");
      expect(await anonymousStatus()).to.equal(HTTP_UNAUTHORIZED);
      const details = await contractClient.get(`/api/media/assets/${file.id}`);
      expect(details.data.asset.url).to.equal(file.url);
    });
  });
}

describe("[integration] media delivery — the link contract", () => {
  before(async function () {
    this.timeout(40_000);
    const session = await ensureOwnerSession();
    contractClient = authorizedClient(session.accessToken);
    contractToken = session.accessToken;
  });

  after(async () => {
    for (const id of contractFolderIds)
      await contractClient.delete(`/api/media/folders/${id}`);
  });

  describeLinkAnswers();
  describeLinkLifetimes();
});
