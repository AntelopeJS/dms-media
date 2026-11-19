import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import { PNG_MIMETYPE, uploadAsset } from "../helpers/assets";
import { createdBody, readBody, urlBody } from "../helpers/bodies";
import { signedLifetimeSeconds } from "../helpers/delivery";
import { authorizedClient, getBaseUrl } from "../helpers/http";
import { withMediaConfig } from "../helpers/media-config";
import { ensureOwnerSession } from "../helpers/owner";
import { solidPng } from "../helpers/png";

const HTTP_OK = 200;
const CDN = "https://cdn.example.org";
const DMS_ORIGIN = "http://127.0.0.1:5010";

const deliveryBody = z.object({
  items: z.array(
    z.object({ id: z.string(), copyValue: z.string().optional() }),
  ),
});
const previewsBody = z.object({ previews: z.record(z.unknown()) });
const historyBody = z.object({
  items: z.array(z.object({ title: z.string() })),
});

let client: AxiosInstance;

async function scratchFolder(name: string): Promise<string> {
  const created = await client.post("/api/media/folders", { name });
  expect(created.status, name).to.equal(HTTP_OK);
  return readBody(created, createdBody).id;
}

function describeReadUrls(): void {
  describe("read URLs, previews and asset search", () => {
    it("serves a read URL of five minutes for the original and a size, previews images only, and searches by name and type", async () => {
      const folder = await scratchFolder("Read URLs");
      try {
        const bytes = await solidPng(500, 400);
        const photo = await uploadAsset(
          client,
          folder,
          "Toiture été.png",
          PNG_MIMETYPE,
          bytes,
        );
        const document = await uploadAsset(
          client,
          folder,
          "toiture.pdf",
          "application/pdf",
          Buffer.from("%PDF-1.4\n%%EOF\n"),
        );
        const original = readBody(
          await client.get(`/api/media/assets/${photo.id}/read-url`),
          urlBody,
        ).url;
        const thumb = readBody(
          await client.get(`/api/media/assets/${photo.id}/read-url`, {
            params: { preset: "thumb" },
          }),
          urlBody,
        ).url;
        for (const url of [original, thumb]) {
          const lifetime = await signedLifetimeSeconds(url);
          expect(lifetime).to.be.within(241, 300);
        }
        const served = await fetch(new URL(original, getBaseUrl()));
        expect(Buffer.from(await served.arrayBuffer()).equals(bytes)).to.equal(
          true,
        );
        const rendered = await fetch(new URL(thumb, getBaseUrl()));
        expect(rendered.status).to.equal(HTTP_OK);
        const renderedBytes = Buffer.from(await rendered.arrayBuffer());
        expect(renderedBytes.byteLength).to.be.greaterThan(0);
        expect(renderedBytes.equals(bytes)).to.equal(false);

        const previews = await client.get(
          `/api/media/previews?ids=${photo.id}&ids=${document.id}`,
        );
        expect(
          Object.keys(readBody(previews, previewsBody).previews),
        ).to.deep.equal([photo.id]);

        const search = await client.get("/api/media/assets/search", {
          params: { q: "toiture", mime: "application/", folderId: folder },
        });
        expect(
          readBody(
            search,
            z.object({ assets: z.array(createdBody) }),
          ).assets.map((asset) => asset.id),
        ).to.deep.equal([document.id]);
      } finally {
        await client.delete(`/api/media/folders/${folder}`);
      }
    });
  });
}

function describeFileTabs(): void {
  describe("file tabs and delivery link origin", () => {
    async function linksOf(assetId: string) {
      const origin = z
        .object({ origin: z.string() })
        .parse((await client.get("/api/media/links/origin")).data).origin;
      const delivery = readBody(
        await client.get(`/api/media/assets/${assetId}/delivery`),
        deliveryBody,
      ).items;
      const presets = readBody(
        await client.get("/api/media/presets"),
        z.object({
          presets: z.array(
            z.object({ id: z.string(), exampleUrl: z.string().nullable() }),
          ),
        }),
      ).presets;
      return {
        origin,
        copy: Object.fromEntries(
          delivery.map((item) => [item.id, item.copyValue]),
        ),
        example: presets.find((preset) => preset.id === "thumb")?.exampleUrl,
      };
    }

    it("reads a renamed file's details and history, with delivery links on the public origin for the original and each size", async () => {
      const folder = await scratchFolder("File tabs");
      try {
        const photo = await uploadAsset(
          client,
          folder,
          "onglets.png",
          PNG_MIMETYPE,
          await solidPng(40, 30),
        );
        await client.post(`/api/media/assets/${photo.id}/update`, {
          name: "onglets 2.png",
        });
        const { origin, copy } = await linksOf(photo.id);
        expect(origin).to.equal(DMS_ORIGIN);
        const details = await client.get(
          `/api/media/assets/${photo.id}/details`,
        );
        expect(details.data.asset.name).to.equal("onglets 2.png");
        const history = readBody(
          await client.get(`/api/media/assets/${photo.id}/history`),
          historyBody,
        );
        expect(history.items.map((item) => item.title)).to.deep.equal([
          "$dms_media.activity.asset_rename",
          "$dms_media.activity.asset_upload",
        ]);
        expect(copy.stable).to.equal(
          `${origin}/media/${photo.id}/${encodeURIComponent("onglets 2.png")}`,
        );
        expect(copy.thumb).to.satisfy((link: string) =>
          link.startsWith(`${origin}/media/${photo.id}/thumb/`),
        );
        expect(copy.preview).to.satisfy((link: string) =>
          link.startsWith(`${origin}/media/${photo.id}/preview/`),
        );
      } finally {
        await client.delete(`/api/media/folders/${folder}`);
      }
    });

    it("starts every copied link with the configured public URL, never with a request header, and drops trailing slashes", async () => {
      const folder = await scratchFolder("Link origin");
      try {
        const photo = await uploadAsset(
          client,
          folder,
          "lien.png",
          PNG_MIMETYPE,
          await solidPng(20, 20),
        );
        await client.post(`/api/media/assets/${photo.id}/visibility`, {
          visibility: "public",
        });
        const fallback = await linksOf(photo.id);
        expect(fallback.origin).to.equal(DMS_ORIGIN);
        expect(fallback.copy.stable).to.equal(
          `${DMS_ORIGIN}/media/${photo.id}/lien.png`,
        );
        expect(fallback.example).to.satisfy((link: string) =>
          link.startsWith(`${DMS_ORIGIN}/media/`),
        );
        const forwarded = await client.get("/api/media/links/origin", {
          headers: {
            "x-forwarded-host": "evil.example.org",
            "x-forwarded-proto": "https",
            host: "evil.example.org",
          },
        });
        expect(forwarded.data.origin).to.equal(DMS_ORIGIN);
        for (const configured of [CDN, `${CDN}//`]) {
          await withMediaConfig({ publicBaseUrl: configured }, async () => {
            const seen = await linksOf(photo.id);
            expect(seen.origin, configured).to.equal(CDN);
            expect(seen.copy.stable, configured).to.equal(
              `${CDN}/media/${photo.id}/lien.png`,
            );
            expect(seen.example, configured).to.satisfy((link: string) =>
              link.startsWith(`${CDN}/media/`),
            );
            expect(JSON.stringify(seen), configured).not.to.contain("//media");
          });
        }
      } finally {
        await client.delete(`/api/media/folders/${folder}`);
      }
    });
  });
}

describe("[integration] media file reads — read URLs, tabs and link origin", () => {
  before(async function () {
    this.timeout(30_000);
    client = authorizedClient((await ensureOwnerSession()).accessToken);
  });

  describeReadUrls();
  describeFileTabs();
});
