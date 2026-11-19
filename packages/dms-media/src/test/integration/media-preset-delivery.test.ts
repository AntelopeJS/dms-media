import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import { z } from "zod";
import { configureMediaModule, type DmsMediaConfig } from "../../config";
import { type UploadedAsset, uploadAsset } from "../helpers/assets";
import { createdBody, readBody } from "../helpers/bodies";
import { snapshotConfig } from "../helpers/config";
import { withUnwritableDerivatives } from "../helpers/derivative-storage";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import {
  expectRendering,
  noisyImage,
  render,
  withPresets,
} from "../helpers/renderings";

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVICE_UNAVAILABLE = 503;
const THUMB_SIZE = 300;
const PREVIEW_WIDTH = 1600;

const presetsBody = z.object({
  presets: z.array(
    z.object({
      id: z.string(),
      cacheKey: z.string(),
      rendered: z.number(),
      exampleUrl: z.string().nullable(),
      examplePreviewUrl: z.string().nullable(),
    }),
  ),
});
const cacheBody = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      value: z.unknown(),
      detail: z.unknown().optional(),
    }),
  ),
});
const lifetimeValue = z.object({
  key: z.string(),
  params: z.object({ count: z.object({ value: z.number() }) }),
});

let client: AxiosInstance;
let token: string;
let folderId: string;
let initialConfig: DmsMediaConfig;

function upload(
  name: string,
  mimetype: string,
  body: Buffer,
): Promise<UploadedAsset> {
  return uploadAsset(client, folderId, name, mimetype, body);
}

async function readPresets() {
  const response = await client.get("/api/media/presets");
  expect(response.status).to.equal(HTTP_OK);
  return readBody(response, presetsBody).presets;
}

function presetRow(
  presets: Awaited<ReturnType<typeof readPresets>>,
  id: string,
) {
  const row = presets.find((candidate) => candidate.id === id);
  assert.isDefined(row, id);
  return row;
}

function describeRenderings(): void {
  describe("renderings on request", () => {
    it("renders thumb and preview on first request, never upscales, and counts the renderings", async () => {
      const small = await upload(
        "petite été.jpg",
        "image/jpeg",
        await noisyImage(800, 600, "jpeg"),
      );
      const large = await upload(
        "large.png",
        "image/png",
        await noisyImage(2000, 1000, "png"),
      );
      const before = await readPresets();
      const thumb = await render(token, small, "thumb");
      const preview = await render(token, small, "preview");
      const largePreview = await render(token, large, "preview");
      const after = await readPresets();
      await expectRendering(
        thumb,
        { format: "webp", width: THUMB_SIZE, height: THUMB_SIZE },
        "thumb",
      );
      await expectRendering(
        preview,
        { format: "webp", width: 800, height: 600 },
        "preview of a small image",
      );
      await expectRendering(
        largePreview,
        { format: "webp", width: PREVIEW_WIDTH, height: 800 },
        "preview of a large image",
      );
      expect(presetRow(after, "thumb").rendered).to.equal(
        presetRow(before, "thumb").rendered + 1,
      );
      expect(presetRow(after, "preview").rendered).to.equal(
        presetRow(before, "preview").rendered + 2,
      );
    });

    it("renders a changed size again from the same link, under a new cache key", async () => {
      const photo = await upload(
        "changed.png",
        "image/png",
        await noisyImage(500, 400, "png"),
      );
      const before = await render(token, photo, "thumb");
      const keyBefore = presetRow(await readPresets(), "thumb").cacheKey;
      await withPresets(
        initialConfig,
        [{ id: "thumb", width: 100, height: 100, fit: "cover", format: "png" }],
        async () => {
          const after = await render(token, photo, "thumb");
          const keyAfter = presetRow(await readPresets(), "thumb").cacheKey;
          await expectRendering(
            before,
            { format: "webp", width: THUMB_SIZE, height: THUMB_SIZE },
            "before",
          );
          await expectRendering(
            after,
            { format: "png", width: 100, height: 100 },
            "after",
          );
          expect(keyAfter).to.match(/^thumb\./);
          expect(keyAfter).to.not.equal(keyBefore);
        },
      );
    });

    it("answers 404 for a size of a file that is not an image", async () => {
      const pdf = await upload(
        "doc.pdf",
        "application/pdf",
        Buffer.from("%PDF-1.4\n%%EOF\n"),
      );
      expect((await render(token, pdf, "thumb")).status).to.equal(
        HTTP_NOT_FOUND,
      );
    });

    it("answers 503 for a rendering the storage cannot write", async () => {
      const photo = await upload(
        "locked.png",
        "image/png",
        await noisyImage(20, 20, "png"),
      );
      await withUnwritableDerivatives(photo, async () => {
        expect((await render(token, photo, "thumb")).status).to.equal(
          HTTP_SERVICE_UNAVAILABLE,
        );
      });
    });
  });
}

function describeSizesApi(): void {
  describe("the image sizes API", () => {
    it("gives the signed link lifetimes and the clean-up's last and next run", async () => {
      const response = await client.get("/api/media/presets/cache");
      expect(response.status).to.equal(HTTP_OK);
      const items = new Map(
        readBody(response, cacheBody).items.map((item) => [item.id, item]),
      );
      const lifetime = (id: string) => {
        const value = lifetimeValue.parse(items.get(id)?.value);
        return `${value.key.split(".").pop()} ${value.params.count.value}`;
      };
      expect(lifetime("public")).to.equal("hours 1");
      expect(lifetime("private")).to.equal("minutes 5");
      const sweep = JSON.stringify(items.get("sweep"));
      expect(sweep).to.match(/sweep_(never|last)/);
      expect(sweep).to.contain('"type":"datetime"');
    });

    it("names every size in the config block", async () => {
      const response = await client.get("/api/media/presets/config");
      const { code } = readBody(response, z.object({ code: z.string() }));
      for (const word of ["presets", "thumb", "preview"]) {
        expect(code).to.contain(word);
      }
    });

    it("builds the example on the public photo, even when a private one is newer", async () => {
      const publicFolder = readBody(
        await client.post("/api/media/folders", { name: "Examples" }),
        createdBody,
      ).id;
      try {
        const name = "exemple été.png";
        const publicPhoto = await uploadAsset(
          client,
          publicFolder,
          name,
          "image/png",
          await noisyImage(50, 40, "png"),
        );
        const flip = await client.post(
          `/api/media/folders/${publicFolder}/visibility`,
          { visibility: "public" },
        );
        expect(flip.status).to.equal(HTTP_OK);
        await upload(
          "newer private.png",
          "image/png",
          await noisyImage(50, 40, "png"),
        );
        const path = `/media/${publicPhoto.id}/thumb/${encodeURIComponent(name)}`;
        const thumb = presetRow(await readPresets(), "thumb");
        expect(thumb.examplePreviewUrl).to.equal(path);
        const { origin } = readBody(
          await client.get("/api/media/links/origin"),
          z.object({ origin: z.string() }),
        );
        expect(origin).to.match(/^https?:\/\//);
        expect(thumb.exampleUrl).to.equal(`${origin}${path}`);
      } finally {
        await client.delete(`/api/media/folders/${publicFolder}`);
      }
    });
  });
}

describe("[integration] media presets — renderings and the image sizes API", () => {
  before(async function () {
    this.timeout(40_000);
    initialConfig = snapshotConfig();
    token = (await ensureOwnerSession()).accessToken;
    client = authorizedClient(token);
    const folder = await client.post("/api/media/folders", {
      name: "Preset delivery",
    });
    expect(folder.status).to.equal(HTTP_OK);
    folderId = readBody(folder, createdBody).id;
  });

  after(async () => {
    configureMediaModule(initialConfig);
    await client.delete(`/api/media/folders/${folderId}`);
  });

  afterEach(() => {
    configureMediaModule(initialConfig);
  });

  describeRenderings();
  describeSizesApi();
});
