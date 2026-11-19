import type { AxiosInstance } from "axios";
import { expect } from "chai";
import sharp from "sharp";
import { configureMediaModule, type DmsMediaConfig } from "../../config";
import { DEFAULT_PRESETS, type MediaPresetConfig } from "../../presets";
import { type UploadedAsset, uploadAsset } from "../helpers/assets";
import { createdBody, readBody } from "../helpers/bodies";
import { snapshotConfig } from "../helpers/config";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import {
  decodeFrame,
  expectRendering,
  litOnMiddleRow,
  near,
  noisyImage,
  paintedPng,
  render,
  withPresets,
} from "../helpers/renderings";

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const PHOTO_WIDTH = 400;
const PHOTO_HEIGHT = 300;
const BAND_SIZE = 300;
const THUMB_SIZE = 300;
const PREVIEW_WIDTH = 1600;
const BOX_WIDTH = 100;
const BOX_HEIGHT = 50;
const CONTAIN_LIT_WIDTH = 67;
const RED = [220, 30, 30];
const GREEN = [30, 200, 30];
const BLUE = [30, 30, 220];
const WHITE = [240, 240, 240];
const BLACK = [0, 0, 0];
const SVG_SOURCE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#cc3366"/></svg>';

const CONFIGURED_SIZES: MediaPresetConfig[] = [
  {
    id: "thumb",
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    fit: "cover",
    format: "webp",
    quality: 80,
  },
  { id: "wide", width: 200, format: "jpeg", quality: 30 },
  { id: "sharp", width: 200, format: "jpeg", quality: 95 },
  {
    id: "box",
    width: BOX_WIDTH,
    height: BOX_HEIGHT,
    fit: "contain",
    format: "png",
  },
  { id: "fit", width: BOX_WIDTH, height: BOX_HEIGHT, fit: "inside" },
  { id: "tall", height: 120 },
  { id: "same" },
  { id: "cov", width: 50, height: 50, format: "png" },
  { id: "vector" },
  { id: "vecwebp", width: 80, format: "webp" },
  { id: "noq", width: 200 },
  { id: "q30", width: 200, quality: 30 },
];

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

function describeDefaultSettings(): void {
  describe("the default sizes", () => {
    it("uses the documented settings, byte for byte, and not a neighbouring quality", async () => {
      const source = await sharp({
        create: {
          width: 2400,
          height: 1200,
          channels: 3,
          background: "#808080",
          noise: { type: "gaussian", mean: 128, sigma: 60 },
        },
      })
        .jpeg()
        .toBuffer();
      const asset = await upload("grand.jpg", "image/jpeg", source);
      const documented = [
        {
          preset: "thumb",
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          fit: "cover",
          quality: 80,
        },
        {
          preset: "preview",
          width: PREVIEW_WIDTH,
          height: undefined,
          fit: "inside",
          quality: 82,
        },
      ] as const;
      for (const size of documented) {
        const expected = (quality: number) =>
          sharp(source, { animated: false })
            .autoOrient()
            .resize({
              width: size.width,
              height: size.height,
              fit: size.fit,
              withoutEnlargement: true,
            })
            .webp({ quality })
            .toBuffer();
        const served = await render(token, asset, size.preset);
        const wanted = await expected(size.quality);
        const neighbour = await expected(size.quality - 2);
        expect(
          served.bytes.equals(wanted),
          `${size.preset} is WebP ${size.quality}`,
        ).to.equal(true);
        expect(
          wanted.equals(neighbour),
          `${size.preset} differs from WebP ${size.quality - 2}`,
        ).to.equal(false);
        expect(served.bytes.equals(neighbour), size.preset).to.equal(false);
      }
    });
  });
}

function describeConfiguredSizes(): void {
  describe("configured sizes", () => {
    it("follows each field of a presets list, which replaces the defaults", async () => {
      await withPresets(initialConfig, CONFIGURED_SIZES, async () => {
        const photo = await upload(
          "photo.jpg",
          "image/jpeg",
          await noisyImage(PHOTO_WIDTH, PHOTO_HEIGHT, "jpeg"),
        );
        const logo = await upload(
          "logo.svg",
          "image/svg+xml",
          Buffer.from(SVG_SOURCE),
        );
        const wide = await render(token, photo, "wide");
        const sharper = await render(token, photo, "sharp");
        await expectRendering(
          wide,
          { format: "jpeg", width: 200, height: 150 },
          "wide",
        );
        await expectRendering(
          sharper,
          { format: "jpeg", width: 200, height: 150 },
          "sharp",
        );
        expect(
          sharper.bytes.byteLength,
          "quality 95 is heavier than 30",
        ).to.be.greaterThan(wide.bytes.byteLength);
        const fittedSizes = [
          ["box", "png", BOX_WIDTH, BOX_HEIGHT],
          ["fit", "jpeg", CONTAIN_LIT_WIDTH, BOX_HEIGHT],
          ["tall", "jpeg", 160, 120],
          ["same", "jpeg", PHOTO_WIDTH, PHOTO_HEIGHT],
          ["cov", "png", 50, 50],
        ] as const;
        for (const [preset, format, width, height] of fittedSizes) {
          await expectRendering(
            await render(token, photo, preset),
            { format, width, height },
            preset,
          );
        }
        const vector = await render(token, logo, "vector");
        expect(vector.contentType, "an SVG without a format").to.equal(
          "image/png",
        );
        expect((await sharp(vector.bytes).metadata()).format).to.equal("png");
        const vectorWebp = await render(token, logo, "vecwebp");
        expect(vectorWebp.contentType, "an SVG with a format").to.equal(
          "image/webp",
        );
        expect((await sharp(vectorWebp.bytes).metadata()).width).to.equal(80);
        expect(
          (await render(token, photo, "preview")).status,
          "the list replaced the defaults",
        ).to.equal(HTTP_NOT_FOUND);
        const noQuality = await render(token, photo, "noq");
        const qualityOnly = await render(token, photo, "q30");
        expect(
          noQuality.bytes.equals(qualityOnly.bytes),
          "quality without a format changes nothing",
        ).to.equal(true);
        const info = await sharp(noQuality.bytes).metadata();
        expect([info.format, info.width]).to.deep.equal(["jpeg", 200]);
      });
    });
  });
}

function describeCropping(): void {
  describe("cover and contain", () => {
    it("crops a cover size around the centre", async () => {
      const bands = await paintedPng(BAND_SIZE * 3, BAND_SIZE, (x) =>
        x < BAND_SIZE ? RED : x < BAND_SIZE * 2 ? GREEN : BLUE,
      );
      const asset = await upload("bandes.png", "image/png", bands);
      const frame = await decodeFrame(
        (await render(token, asset, "thumb")).bytes,
      );
      const row = Math.floor(frame.height / 2);
      for (const fraction of [0.02, 0.5, 0.98]) {
        const x = Math.min(Math.floor(frame.width * fraction), frame.width - 1);
        expect(near(frame.at(x, row), GREEN), `green at ${fraction}`).to.equal(
          true,
        );
      }
    });

    it("keeps the whole image in a contain size and fills the box with a cover size", async () => {
      const framed = await paintedPng(PHOTO_WIDTH, PHOTO_HEIGHT, (x, y) =>
        y < 30 ? RED : y >= 270 ? BLUE : x < 40 ? GREEN : WHITE,
      );
      const box = {
        width: BOX_WIDTH,
        height: BOX_HEIGHT,
        format: "png",
      } as const;
      await withPresets(
        initialConfig,
        [
          { id: "boxcontain", fit: "contain", ...box },
          { id: "boxcover", fit: "cover", ...box },
        ],
        async () => {
          const asset = await upload("framed.png", "image/png", framed);
          const contain = await decodeFrame(
            (await render(token, asset, "boxcontain")).bytes,
          );
          expect([contain.width, contain.height]).to.deep.equal([
            BOX_WIDTH,
            BOX_HEIGHT,
          ]);
          expect(litOnMiddleRow(contain)).to.be.closeTo(CONTAIN_LIT_WIDTH, 1);
          expect(near(contain.at(2, 25), BLACK), "left bar").to.equal(true);
          expect(near(contain.at(97, 25), BLACK), "right bar").to.equal(true);
          expect(near(contain.at(50, 1), RED), "top band kept").to.equal(true);
          expect(near(contain.at(50, 48), BLUE), "bottom band kept").to.equal(
            true,
          );
          const cover = await decodeFrame(
            (await render(token, asset, "boxcover")).bytes,
          );
          expect([cover.width, cover.height]).to.deep.equal([
            BOX_WIDTH,
            BOX_HEIGHT,
          ]);
          expect(litOnMiddleRow(cover)).to.equal(BOX_WIDTH);
          expect(near(cover.at(2, 25), GREEN), "left band fills").to.equal(
            true,
          );
          expect(near(cover.at(50, 1), WHITE), "top band cropped").to.equal(
            true,
          );
          expect(near(cover.at(50, 48), WHITE), "bottom band cropped").to.equal(
            true,
          );
        },
      );
    });
  });
}

describe("[integration] media presets — default and configured image sizes", () => {
  before(async function () {
    this.timeout(40_000);
    initialConfig = snapshotConfig();
    expect(initialConfig.presets).to.deep.equal(DEFAULT_PRESETS);
    token = (await ensureOwnerSession()).accessToken;
    client = authorizedClient(token);
    const folder = await client.post("/api/media/folders", { name: "Presets" });
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

  describeDefaultSettings();
  describeConfiguredSizes();
  describeCropping();
});
