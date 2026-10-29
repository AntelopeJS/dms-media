import { randomUUID } from "node:crypto";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import sharp from "sharp";
import { MediaAssetModel } from "../../db";
import { uploadStorageBytes } from "../../derivatives";
import {
  applyImageTransform,
  type ImageTransformOps,
  MediaAssetChangedError,
} from "../../transform";
import { type UploadedAsset, uploadAsset } from "../helpers/assets";
import { authorizedClient, getBaseUrl } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_FOUND = 302;
const HTTP_NOT_MODIFIED = 304;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const HTTP_SERVICE_UNAVAILABLE = 503;
const FOREIGN_ORIGIN = "https://shop.example.com";
const EXIF_ROTATED_RIGHT = 6;
const PHOTO_WIDTH = 40;
const PHOTO_HEIGHT = 20;
const WIDE_SVG_WIDTH = 880;
const WIDE_SVG_HEIGHT = 240;
const WIDE_SVG_SOURCE = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDE_SVG_WIDTH}" height="${WIDE_SVG_HEIGHT}"><rect width="${WIDE_SVG_WIDTH}" height="${WIDE_SVG_HEIGHT}" fill="#f0a000"/></svg>`;
const SVG_SOURCE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><script>alert(1)</script><circle cx="10" cy="10" r="9"/></svg>';

interface Delivery {
  status: number;
  headers: Headers;
  body: Buffer;
}

async function deliver(
  path: string,
  headers: Record<string, string> = {},
): Promise<Delivery> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    redirect: "manual",
    headers,
  });
  return {
    status: response.status,
    headers: response.headers,
    body: Buffer.from(await response.arrayBuffer()),
  };
}

/** Follows the delivery redirect to the storage and returns the stored bytes. */
async function follow(
  path: string,
  headers: Record<string, string> = {},
): Promise<Delivery> {
  const redirect = await deliver(path, headers);
  expect(redirect.status, path).to.equal(HTTP_FOUND);
  const response = await fetch(redirect.headers.get("location") as string);
  return {
    status: response.status,
    headers: response.headers,
    body: Buffer.from(await response.arrayBuffer()),
  };
}

function photo(): Promise<Buffer> {
  return sharp({
    create: {
      width: PHOTO_WIDTH,
      height: PHOTO_HEIGHT,
      channels: 3,
      background: "#3366cc",
    },
  })
    .jpeg()
    .toBuffer();
}

async function animatedGif(): Promise<Buffer> {
  const frames = await Promise.all(
    [0, 120, 240].map((red) =>
      sharp({
        create: {
          width: PHOTO_WIDTH,
          height: PHOTO_HEIGHT,
          channels: 3,
          background: { r: red, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer(),
    ),
  );
  return sharp(frames, { join: { animated: true } })
    .gif()
    .toBuffer();
}

async function insertStoredAsset(
  folderId: string,
  name: string,
  mimetype: string,
  bytes: Buffer,
): Promise<string> {
  const storageKey = await uploadStorageBytes(
    bytes,
    name,
    mimetype,
    `delivery-tests/${randomUUID()}`,
    undefined,
  );
  const [assetId] = await GetModel(MediaAssetModel, DEFAULT_TENANT_ID).insert({
    folderId,
    mediaRevision: randomUUID(),
    json_retiredFiles: "[]",
    name,
    mimetype,
    size: bytes.byteLength,
    storageKey,
    visibility: "inherit",
    createdBy: "delivery-tests",
  });
  return assetId;
}

function assetPath(asset: UploadedAsset, preset?: string): string {
  const name = encodeURIComponent(asset.name);
  return preset
    ? `/media/${asset.id}/${preset}/${name}`
    : `/media/${asset.id}/${name}`;
}

describe("[integration] media delivery and editing — cache, orientation, active content, copies", () => {
  let client: AxiosInstance;
  let token: string;
  let folderId: string;
  let jpeg: UploadedAsset;

  before(async function () {
    this.timeout(40_000);
    const session = await ensureOwnerSession();
    token = session.accessToken;
    client = authorizedClient(token);
    const folder = await client.post("/api/media/folders", {
      name: "Delivery and editing",
    });
    expect(folder.status).to.equal(HTTP_OK);
    folderId = folder.data.id;
    jpeg = await uploadAsset(
      client,
      folderId,
      "photo.jpg",
      "image/jpeg",
      await photo(),
    );
  });

  after(async () => {
    await client.delete(`/api/media/folders/${folderId}`);
  });

  it("redirects members to a signed URL that is never cached", async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const first = await deliver(assetPath(jpeg), auth);
    expect(first.status).to.equal(HTTP_FOUND);
    expect(first.headers.get("cache-control")).to.equal("no-store");
    const again = await deliver(assetPath(jpeg), auth);
    expect(again.headers.get("location")).to.equal(
      first.headers.get("location"),
    );
  });

  it("answers a bare 401 to scripts and sends browsers to the file page", async () => {
    const anonymous = await deliver(assetPath(jpeg));
    expect(anonymous.status).to.equal(HTTP_UNAUTHORIZED);
    const browser = await deliver(assetPath(jpeg), { Accept: "text/html" });
    const location = browser.headers.get("location") ?? "";
    const isFilePageRedirect =
      browser.status === HTTP_FOUND &&
      location.endsWith(`/modules/media/file?asset=${jpeg.id}`);
    const isSignInPage =
      browser.status === HTTP_UNAUTHORIZED &&
      (browser.headers.get("content-type") ?? "").startsWith("text/html");
    expect(isFilePageRedirect || isSignInPage).to.equal(true);
  });

  it("sends stale or empty file names to the canonical URL", async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const renamed = await deliver(`/media/${jpeg.id}/other.exe`, auth);
    expect(renamed.status).to.equal(HTTP_FOUND);
    expect(renamed.headers.get("location")).to.equal(assetPath(jpeg));
    const derivative = await deliver(`/media/${jpeg.id}/thumb/x.jpg`, auth);
    expect(derivative.headers.get("location")).to.equal(
      assetPath(jpeg, "thumb"),
    );
    const empty = await deliver(`/media/${jpeg.id}/thumb/`, auth);
    expect(empty.status).to.equal(HTTP_NOT_FOUND);
  });

  it("names derivatives readably and leaves updatedAt alone when rendering them", async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const before = await client.get(`/api/media/assets/${jpeg.id}`);
    const thumb = await follow(assetPath(jpeg, "thumb"), auth);
    expect(thumb.status).to.equal(HTTP_OK);
    expect(thumb.headers.get("content-disposition")).to.contain(
      'filename="photo-thumb.webp"',
    );
    const after = await client.get(`/api/media/assets/${jpeg.id}`);
    expect(after.data.asset.updatedAt).to.equal(before.data.asset.updatedAt);
  });

  it("redirects public files without caching the redirect, and opens CORS", async () => {
    const flip = await client.post(
      `/api/media/folders/${folderId}/visibility`,
      { visibility: "public" },
    );
    expect(flip.status).to.equal(HTTP_OK);
    const first = await deliver(assetPath(jpeg, "thumb"), {
      Origin: FOREIGN_ORIGIN,
    });
    expect(first.status).to.equal(HTTP_FOUND);
    expect(first.headers.get("cache-control")).to.equal("no-cache");
    expect(first.headers.get("access-control-allow-origin")).to.equal("*");
    const second = await deliver(assetPath(jpeg, "thumb"));
    expect(second.headers.get("location")).to.equal(
      first.headers.get("location"),
    );
    await client.post(`/api/media/folders/${folderId}/visibility`, {
      visibility: "private",
    });
  });

  it("points the same link at the edited image right after an edit", async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const before = await deliver(assetPath(jpeg, "thumb"), auth);
    const edit = await client.post(`/api/media/assets/${jpeg.id}/transform`, {
      rotate: 90,
    });
    expect(edit.status).to.equal(HTTP_OK);
    const after = await follow(assetPath(jpeg), auth);
    const metadata = await sharp(after.body).metadata();
    expect([metadata.width, metadata.height]).to.deep.equal([
      PHOTO_HEIGHT,
      PHOTO_WIDTH,
    ]);
    const thumb = await deliver(assetPath(jpeg, "thumb"), auth);
    expect(thumb.headers.get("location")).to.not.equal(
      before.headers.get("location"),
    );
    await client.post(`/api/media/assets/${jpeg.id}/revert`);
  });

  it("renders derivatives upright for EXIF-rotated photos", async () => {
    const rotated = await sharp(await photo())
      .withMetadata({ orientation: EXIF_ROTATED_RIGHT })
      .jpeg()
      .toBuffer();
    const asset = await uploadAsset(
      client,
      folderId,
      "phone.jpg",
      "image/jpeg",
      rotated,
    );
    const preview = await follow(assetPath(asset, "preview"), {
      Authorization: `Bearer ${token}`,
    });
    const metadata = await sharp(preview.body).metadata();
    expect([metadata.width, metadata.height]).to.deep.equal([
      PHOTO_HEIGHT,
      PHOTO_WIDTH,
    ]);
  });

  it("keeps animation, rasterizes vectors sharply and sandboxes SVG", async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const gif = await uploadAsset(
      client,
      folderId,
      "loop.gif",
      "image/gif",
      await animatedGif(),
    );
    const preview = await follow(assetPath(gif, "preview"), auth);
    expect((await sharp(preview.body).metadata()).pages).to.equal(3);
    const svg = await uploadAsset(
      client,
      folderId,
      "logo.svg",
      "image/svg+xml",
      Buffer.from(SVG_SOURCE),
    );
    const thumb = await follow(assetPath(svg, "thumb"), auth);
    expect((await sharp(thumb.body).metadata()).width).to.equal(300);
    const original = await deliver(assetPath(svg), auth);
    expect(original.status).to.equal(HTTP_OK);
    expect(original.headers.get("content-security-policy")).to.equal("sandbox");
    const revalidated = await deliver(assetPath(svg), {
      ...auth,
      "If-None-Match": original.headers.get("etag") as string,
    });
    expect(revalidated.status).to.equal(HTTP_NOT_MODIFIED);
  });

  it("fits a wide vector inside its library thumbnail instead of cropping it", async () => {
    const logo = await uploadAsset(
      client,
      folderId,
      "wide-logo.svg",
      "image/svg+xml",
      Buffer.from(WIDE_SVG_SOURCE),
    );
    const banner = await uploadAsset(
      client,
      folderId,
      "wide-banner.png",
      "image/png",
      await sharp({
        create: {
          /** Larger than the thumb both ways, so its square crop shows. */
          width: WIDE_SVG_WIDTH * 2,
          height: WIDE_SVG_HEIGHT * 2,
          channels: 3,
          background: { r: 240, g: 160, b: 0 },
        },
      })
        .png()
        .toBuffer(),
    );
    const answer = await client.post("/api/media/previews", {
      ids: [logo.id, banner.id],
    });
    expect(answer.status).to.equal(HTTP_OK);
    const [vector, raster] = await Promise.all(
      [logo.id, banner.id].map(async (id) => {
        const response = await fetch(answer.data.previews[id]);
        return sharp(Buffer.from(await response.arrayBuffer())).metadata();
      }),
    );
    expect((vector.width ?? 0) / (vector.height ?? 1)).to.be.closeTo(
      WIDE_SVG_WIDTH / WIDE_SVG_HEIGHT,
      0.05,
    );
    expect(raster.width).to.equal(raster.height);
  });

  it("never serves an HTML file inline", async () => {
    const id = await insertStoredAsset(
      folderId,
      "page.html",
      "text/html",
      Buffer.from("<script>alert(1)</script>"),
    );
    const page = await deliver(`/media/${id}/page.html`, {
      Authorization: `Bearer ${token}`,
    });
    expect(page.status).to.equal(HTTP_OK);
    expect(page.headers.get("content-disposition")).to.match(/^attachment;/);
    expect(page.headers.get("content-security-policy")).to.equal("sandbox");
  });

  it("answers 422 instead of 500 for an unreadable image", async () => {
    const id = await insertStoredAsset(
      folderId,
      "broken.png",
      "image/png",
      Buffer.from("not an image"),
    );
    const auth = { Authorization: `Bearer ${token}` };
    const thumb = await deliver(`/media/${id}/thumb/broken.png`, auth);
    expect(thumb.status).to.equal(HTTP_UNPROCESSABLE_ENTITY);
    const again = await deliver(`/media/${id}/thumb/broken.png`, auth);
    expect(again.status).to.equal(HTTP_UNPROCESSABLE_ENTITY);
  });

  it("hides storage keys when a size cannot be rendered for another reason", async () => {
    const id = await GetModel(MediaAssetModel, DEFAULT_TENANT_ID).insert({
      folderId,
      mediaRevision: randomUUID(),
      json_retiredFiles: "[]",
      name: "gone.png",
      mimetype: "image/png",
      size: 1,
      storageKey: `delivery-tests/missing-${randomUUID()}.png`,
      visibility: "inherit",
      createdBy: "delivery-tests",
    });
    const auth = { Authorization: `Bearer ${token}` };
    for (const attempt of [1, 2]) {
      const thumb = await deliver(`/media/${id[0]}/thumb/gone.png`, auth);
      expect(thumb.status, `attempt ${attempt}`).to.equal(
        HTTP_SERVICE_UNAVAILABLE,
      );
      expect(thumb.body.toString()).to.not.contain("delivery-tests/");
    }
  });

  it("saves an edit as a copy next to the untouched source", async () => {
    const copy = await client.post(
      `/api/media/assets/${jpeg.id}/transform/copy`,
      { crop: { x: 0, y: 0, width: 0.5, height: 1 } },
    );
    expect(copy.status).to.equal(HTTP_OK);
    expect(copy.data.asset.name).to.equal("photo (2).jpg");
    expect(copy.data.asset.folderId).to.equal(folderId);
    expect([copy.data.asset.width, copy.data.asset.height]).to.deep.equal([
      PHOTO_WIDTH / 2,
      PHOTO_HEIGHT,
    ]);
    const source = await client.get(`/api/media/assets/${jpeg.id}`);
    expect(source.data.asset.width).to.equal(PHOTO_WIDTH);
    expect(source.data.asset.hasOriginal).to.equal(false);
  });

  it("renders successive edits from the original and resets on revert", async () => {
    const model = GetModel(MediaAssetModel, DEFAULT_TENANT_ID);
    const transform = (body: ImageTransformOps) =>
      client.post(`/api/media/assets/${jpeg.id}/transform`, body);
    expect((await transform({ rotate: 90 })).status).to.equal(HTTP_OK);
    const cropped = await transform({
      crop: { x: 0, y: 0, width: 1, height: 0.5 },
    });
    expect([cropped.data.asset.width, cropped.data.asset.height]).to.deep.equal(
      [PHOTO_HEIGHT, PHOTO_WIDTH / 2],
    );
    const edited = await model.get(jpeg.id);
    expect(edited?.json_transform).to.be.a("string").and.not.equal("");
    expect(edited?.originalSize).to.be.greaterThan(0);
    const reverted = await client.post(`/api/media/assets/${jpeg.id}/revert`);
    expect(reverted.data.asset.width).to.equal(PHOTO_WIDTH);
    const restored = await model.get(jpeg.id);
    expect(restored?.json_transform).to.equal("");
    expect(restored?.originalSize).to.equal(0);
  });

  it("refuses an edit rendered from a version someone replaced", async () => {
    const model = GetModel(MediaAssetModel, DEFAULT_TENANT_ID);
    const stale = await model.get(jpeg.id);
    const edit = await client.post(`/api/media/assets/${jpeg.id}/transform`, {
      rotate: 180,
    });
    expect(edit.status).to.equal(HTTP_OK);
    const outcome = await applyImageTransform(model, stale!, {
      rotate: 90,
    }).catch((error: unknown) => error);
    expect(outcome).to.be.instanceOf(MediaAssetChangedError);
    const both = await Promise.all(
      [90, 270].map((rotate) =>
        client.post(`/api/media/assets/${jpeg.id}/transform`, { rotate }),
      ),
    );
    const statuses = both.map((response) => response.status);
    expect(statuses).to.include(HTTP_OK);
    expect(
      statuses.every((s) => s === HTTP_OK || s === HTTP_CONFLICT),
    ).to.equal(true);
    await client.post(`/api/media/assets/${jpeg.id}/revert`);
  });
});
