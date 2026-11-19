import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { DeleteFile } from "@antelopejs/interface-file-storage";
import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import { getMediaConfig } from "../../config";
import { withMediaConfig } from "../helpers/media-config";
import { MediaAssetModel } from "../../db";
import { type UploadedAsset, uploadAsset } from "../helpers/assets";
import { createdBody, readBody } from "../helpers/bodies";
import { deliver, longText } from "../helpers/delivery";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_NOT_MODIFIED = 304;
const HTTP_PARTIAL_CONTENT = 206;
const HTTP_BAD_GATEWAY = 502;
const FOREIGN_ORIGIN = "https://shop.example.com";
const LONG_DESCRIPTION_LINES = 3000;
const SVG_SOURCE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><script>alert(1)</script><circle cx="10" cy="10" r="9"/></svg>';

let client: AxiosInstance;
let token: string;
let folderId: string;

function assetPath(asset: UploadedAsset): string {
  return `/media/${asset.id}/${encodeURIComponent(asset.name)}`;
}

function longSvg(): Buffer {
  const opening = SVG_SOURCE.indexOf(">") + 1;
  return Buffer.concat([
    Buffer.from(SVG_SOURCE.slice(0, opening)),
    Buffer.from("<desc>"),
    longText(LONG_DESCRIPTION_LINES),
    Buffer.from("</desc>"),
    Buffer.from(SVG_SOURCE.slice(opening)),
  ]);
}

function describeActiveContent(): void {
  describe("files the API streams itself", () => {
    it("serves an SVG inline under a sandbox, with an ETag and no byte ranges", async () => {
      const drawing = longSvg();
      const svg = await uploadAsset(
        client,
        folderId,
        "logo étoilé.svg",
        "image/svg+xml",
        drawing,
      );
      const auth = { Authorization: `Bearer ${token}` };
      const read = await deliver(assetPath(svg), auth);
      expect(read.status).to.equal(HTTP_OK);
      expect(read.body.equals(drawing)).to.equal(true);
      expect(read.headers.get("content-type")).to.match(/^image\/svg\+xml/);
      expect(read.headers.get("content-disposition")).to.match(/^inline/);
      expect(read.headers.get("content-security-policy")).to.equal("sandbox");
      expect(read.headers.get("x-content-type-options")).to.equal("nosniff");
      expect(read.headers.get("cache-control")).to.equal("private, no-cache");
      const etag = read.headers.get("etag");
      assert.isNotNull(etag, "etag");
      const unchanged = await deliver(assetPath(svg), {
        ...auth,
        "If-None-Match": etag,
      });
      expect(unchanged.status).to.equal(HTTP_NOT_MODIFIED);
      expect(unchanged.body.byteLength).to.equal(0);
      const other = await deliver(assetPath(svg), {
        ...auth,
        "If-None-Match": '"other"',
      });
      expect(other.status).to.equal(HTTP_OK);
      expect(other.body.byteLength).to.equal(drawing.byteLength);
      const ranged = await deliver(assetPath(svg), {
        ...auth,
        Range: "bytes=0-9",
      });
      expect(ranged.status).to.not.equal(HTTP_PARTIAL_CONTENT);
      expect(ranged.status).to.equal(HTTP_OK);
      expect(ranged.body.byteLength).to.equal(drawing.byteLength);
      const head = await deliver(assetPath(svg), auth, "HEAD");
      expect(head.status).to.equal(HTTP_OK);
      expect(head.headers.get("content-length")).to.equal(
        String(drawing.byteLength),
      );
      expect(head.body.byteLength).to.equal(0);
    });

    it("serves a public SVG to any origin, still sandboxed", async () => {
      const svg = await uploadAsset(
        client,
        folderId,
        "open.svg",
        "image/svg+xml",
        Buffer.from(SVG_SOURCE),
      );
      const flip = await client.post(`/api/media/assets/${svg.id}/visibility`, {
        visibility: "public",
      });
      expect(flip.status).to.equal(HTTP_OK);
      const open = await deliver(assetPath(svg), { Origin: FOREIGN_ORIGIN });
      expect(open.status).to.equal(HTTP_OK);
      expect(open.headers.get("cache-control")).to.equal("public, no-cache");
      expect(open.headers.get("access-control-allow-origin")).to.equal("*");
      expect(open.headers.get("content-security-policy")).to.equal("sandbox");
    });

    it("streams an XML file as a sandboxed attachment once its type is allowed", async () => {
      const initial = getMediaConfig().allowedMimetypes;
      await withMediaConfig(
        { allowedMimetypes: [...initial, "application/xml", "text/xml"] },
        async () => {
          const bytes = Buffer.concat([
            Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<notes>\n'),
            longText(LONG_DESCRIPTION_LINES),
            Buffer.from("</notes>\n"),
          ]);
          const xml = await uploadAsset(
            client,
            folderId,
            "flux.xml",
            "application/xml",
            bytes,
          );
          const read = await deliver(assetPath(xml), {
            Authorization: `Bearer ${token}`,
          });
          expect(read.status).to.equal(HTTP_OK);
          expect(read.headers.get("content-disposition")).to.match(
            /^attachment/,
          );
          expect(read.headers.get("content-security-policy")).to.equal(
            "sandbox",
          );
          expect(read.headers.get("x-content-type-options")).to.equal(
            "nosniff",
          );
          expect(read.body.equals(bytes)).to.equal(true);
        },
      );
    });

    it("answers 502 for an SVG whose stored file is gone", async () => {
      const svg = await uploadAsset(
        client,
        folderId,
        "gone.svg",
        "image/svg+xml",
        Buffer.from(SVG_SOURCE),
      );
      const stored = await GetModel(MediaAssetModel, DEFAULT_TENANT_ID).get(
        svg.id,
      );
      assert.isDefined(stored, "stored asset");
      await DeleteFile(stored.storageKey, stored.storage);
      const read = await deliver(assetPath(svg), {
        Authorization: `Bearer ${token}`,
      });
      expect(read.status).to.equal(HTTP_BAD_GATEWAY);
    });
  });
}

describe("[integration] media delivery — active content", () => {
  before(async function () {
    this.timeout(40_000);
    const session = await ensureOwnerSession();
    token = session.accessToken;
    client = authorizedClient(token);
    const folder = await client.post("/api/media/folders", {
      name: "Active content",
    });
    expect(folder.status).to.equal(HTTP_OK);
    folderId = readBody(folder, createdBody).id;
  });

  after(async () => {
    await client.delete(`/api/media/folders/${folderId}`);
  });

  describeActiveContent();
});
