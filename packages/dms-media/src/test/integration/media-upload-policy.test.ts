import axios, { type AxiosInstance } from "axios";
import { expect } from "chai";
import { FileExists } from "@antelopejs/interface-file-storage";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  RegisterAssetBinding,
  UnregisterAssetBinding,
} from "@antelopejs/interface-dms-media";
import sharp from "sharp";
import { z } from "zod";
import { CONTENT_ROOT_BINDING } from "../../bindings";
import {
  configureMediaModule,
  type DmsMediaConfig,
  getMediaConfig,
} from "../../config";
import { runPurgeStaging } from "../../crons/purge-staging";
import { MediaFolderModel } from "../../db";
import { putPresigned, uploadAsset, uploadPixelPng } from "../helpers/assets";
import { createdBody, presignBody, readBody } from "../helpers/bodies";
import { fetchFolderNodes } from "../helpers/folders";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const HTTP_REDIRECT_BOUNDARY = 300;
const PDF_BINDING_ID = "upload-policy.pdf-only";
const PDF_FOLDER_NAME = "PDF only uploads";
const PURGE_HORIZON_MS = 25 * 60 * 60 * 1000;
const EXIF_ROTATED_RIGHT = 6;
const LARGER_THAN_PROBE_BYTES = 33 * 1024 * 1024;

const confirmedBody = z.object({
  asset: z.object({
    mimetype: z.string(),
    size: z.number(),
    width: z.number().nullish(),
    height: z.number().nullish(),
  }),
});

interface StagedUpload {
  resourceKey: string;
}

/** The configuration in force, in the shape `configureMediaModule` takes back. */
function snapshotConfig(): DmsMediaConfig {
  const current = getMediaConfig();
  return {
    rootAcl: current.rootAcl,
    storage: current.storage,
    presets: [...current.presets.values()],
    storageQuotaBytes: current.storageQuotaBytes,
    allowedMimetypes: [...current.allowedMimetypes],
  };
}

/** Bound folders are locked through the API: later suites expect an empty library. */
async function removeLinkedFolders(): Promise<void> {
  const folderModel = GetModel(MediaFolderModel, DEFAULT_TENANT_ID);
  const linked = await folderModel.getBy("binding", PDF_BINDING_ID);
  await Promise.all(linked.map((folder) => folderModel.delete(folder._id)));
  const [contentRoot] = await folderModel.getBy(
    "binding",
    CONTENT_ROOT_BINDING,
  );
  if (!contentRoot) return;
  const children = await folderModel.getBy("parentId", contentRoot._id);
  if (children.length === 0) await folderModel.delete(contentRoot._id);
}

let client: AxiosInstance;
let folderId: string;
let initialConfig: DmsMediaConfig;

async function presign(
  target: string,
  filename: string,
  mimetype: string,
  size = 4,
) {
  return client.post("/api/media/upload/presign", {
    folderId: target,
    filename,
    size,
    mimetype,
  });
}

async function stage(
  filename: string,
  mimetype: string,
  body: Buffer,
): Promise<StagedUpload> {
  const presigned = await presign(
    folderId,
    filename,
    mimetype,
    body.byteLength,
  );
  expect(presigned.status, "presign").to.equal(HTTP_OK);
  const target = readBody(presigned, presignBody);
  const put = await putPresigned(target, body);
  expect(put.status, "storage PUT").to.be.lessThan(HTTP_REDIRECT_BOUNDARY);
  return { resourceKey: target.resourceKey };
}

function describeTypeRules(): void {
  describe("accepted types", () => {
    it("refuses HTML whatever its declared type, and types outside the allow-list", async () => {
      const attempts = [
        await presign(folderId, "page.html", "text/html"),
        await presign(folderId, "page.html", "text/plain"),
        await presign(folderId, "page.xhtml", "application/xhtml+xml"),
        await presign(folderId, "setup.exe", "application/x-msdownload"),
      ];
      for (const response of attempts) {
        expect(response.status).to.equal(HTTP_UNSUPPORTED_MEDIA_TYPE);
        expect(response.data.reason).to.equal("type_not_allowed");
      }
      expect(
        (await presign(folderId, "notes.txt", "text/plain")).status,
      ).to.equal(HTTP_OK);
      expect(
        (await presign(folderId, "logo.svg", "image/svg+xml")).status,
      ).to.equal(HTTP_OK);
    });

    it("follows a configured allow-list but never re-enables HTML", async () => {
      configureMediaModule({
        ...initialConfig,
        allowedMimetypes: ["application/zip", "text/html"],
      });
      try {
        expect(
          (await presign(folderId, "a.zip", "application/zip")).status,
        ).to.equal(HTTP_OK);
        expect((await presign(folderId, "a.png", "image/png")).status).to.equal(
          HTTP_UNSUPPORTED_MEDIA_TYPE,
        );
        expect(
          (await presign(folderId, "a.html", "text/html")).status,
        ).to.equal(HTTP_UNSUPPORTED_MEDIA_TYPE);
      } finally {
        configureMediaModule(initialConfig);
      }
    });

    it("refuses a file the linked field does not accept", async () => {
      const linked = (await fetchFolderNodes(client)).find(
        (folder) => folder.binding === PDF_BINDING_ID,
      );
      expect(linked, "linked folder").to.not.equal(undefined);
      const image = await presign(linked!.id, "photo.png", "image/png");
      expect(image.status).to.equal(HTTP_UNSUPPORTED_MEDIA_TYPE);
      expect(image.data.reason).to.equal("field_type");
      expect(image.data.accepted).to.deep.equal(["application/pdf"]);
      expect(
        (await presign(linked!.id, "sheet.pdf", "application/pdf")).status,
      ).to.equal(HTTP_OK);
    });
  });
}

function describeQuota(): void {
  describe("storage quota", () => {
    it("refuses an upload past the storage quota", async () => {
      configureMediaModule({
        ...initialConfig,
        storageQuotaBytes: 1,
      });
      try {
        const response = await presign(folderId, "notes.txt", "text/plain", 10);
        expect(response.status).to.equal(HTTP_PAYLOAD_TOO_LARGE);
        expect(response.data.reason).to.equal("quota");
      } finally {
        configureMediaModule(initialConfig);
      }
    });

    it("checks the quota again at confirm, on the stored size", async () => {
      const staged = await stage("late.txt", "text/plain", Buffer.from("late"));
      configureMediaModule({ ...initialConfig, storageQuotaBytes: 1 });
      try {
        const confirm = await client.post("/api/media/upload/confirm", {
          folderId,
          resourceKey: staged.resourceKey,
          filename: "late.txt",
        });
        expect(confirm.status).to.equal(HTTP_PAYLOAD_TOO_LARGE);
        expect(confirm.data.reason).to.equal("quota");
        expect(await FileExists(staged.resourceKey)).to.equal(false);
      } finally {
        configureMediaModule(initialConfig);
      }
    });
  });
}

function describeContentChecks(): void {
  describe("real content", () => {
    it("refuses a fake image at confirm, whatever the case of its type, and deletes its staged file", async () => {
      for (const mimetype of ["image/png", "Image/PNG"]) {
        const staged = await stage(
          "fake.png",
          mimetype,
          Buffer.from("this is not a png"),
        );
        const confirm = await client.post("/api/media/upload/confirm", {
          folderId,
          resourceKey: staged.resourceKey,
          filename: "fake.png",
        });
        expect(confirm.status, mimetype).to.equal(HTTP_UNPROCESSABLE_ENTITY);
        expect(confirm.data.reason, mimetype).to.equal("invalid_image");
        expect(await FileExists(staged.resourceKey), mimetype).to.equal(false);
      }
    });

    it("stores an image too large to probe, without its size", async function () {
      this.timeout(60_000);
      const jpeg = await sharp({
        create: { width: 8, height: 6, channels: 3, background: "#808080" },
      })
        .jpeg()
        .toBuffer();
      const large = Buffer.concat([
        jpeg,
        Buffer.alloc(LARGER_THAN_PROBE_BYTES),
      ]);
      const staged = await stage("large.jpg", "image/jpeg", large);
      const confirm = await client.post("/api/media/upload/confirm", {
        folderId,
        resourceKey: staged.resourceKey,
        filename: "large.jpg",
      });
      expect(confirm.status, JSON.stringify(confirm.data)).to.equal(HTTP_OK);
      const { asset } = readBody(confirm, confirmedBody);
      expect(asset.mimetype).to.equal("image/jpeg");
      expect(asset.size).to.equal(large.byteLength);
      expect(asset.width ?? undefined).to.equal(undefined);
      expect(asset.height ?? undefined).to.equal(undefined);
    });

    it("confirms a text file declared with the name of an Object.prototype member", async () => {
      configureMediaModule({ ...initialConfig, allowedMimetypes: ["*"] });
      try {
        for (const mimetype of ["constructor", "__proto__"]) {
          const filename = `${mimetype.replaceAll("_", "")}.txt`;
          const staged = await stage(
            filename,
            mimetype,
            Buffer.from("plain text"),
          );
          const confirm = await client.post("/api/media/upload/confirm", {
            folderId,
            resourceKey: staged.resourceKey,
            filename,
          });
          expect(confirm.status, mimetype).to.equal(HTTP_OK);
        }
      } finally {
        configureMediaModule(initialConfig);
      }
    });
  });
}

function describeStaging(): void {
  describe("staged files", () => {
    it("deletes the staged file when the folder disappeared before confirm", async () => {
      const doomed = await client.post("/api/media/folders", {
        name: "Doomed upload target",
      });
      const body = Buffer.from("bytes");
      const doomedId = readBody(doomed, createdBody).id;
      const presigned = readBody(
        await presign(doomedId, "x.txt", "text/plain", body.byteLength),
        presignBody,
      );
      await axios.put(presigned.uploadUrl, body, {
        headers: presigned.headers,
        transformRequest: [(data: Buffer) => data],
      });
      await client.delete(`/api/media/folders/${doomedId}`);
      const confirm = await client.post("/api/media/upload/confirm", {
        folderId: doomedId,
        resourceKey: presigned.resourceKey,
        filename: "x.txt",
      });
      expect(confirm.status).to.be.greaterThanOrEqual(400);
      expect(await FileExists(presigned.resourceKey)).to.equal(false);
    });

    it("deletes a staged file on abort", async () => {
      const staged = await stage(
        "cancelled.txt",
        "text/plain",
        Buffer.from("cancel me"),
      );
      const abort = await client.post("/api/media/upload/abort", {
        folderId,
        resourceKey: staged.resourceKey,
      });
      expect(abort.status).to.equal(HTTP_OK);
      expect(await FileExists(staged.resourceKey)).to.equal(false);
    });

    it("purges staged uploads abandoned for more than a day", async () => {
      const staged = await stage(
        "abandoned.txt",
        "text/plain",
        Buffer.from("left behind"),
      );
      expect(await runPurgeStaging(new Date())).to.equal(0);
      expect(await FileExists(staged.resourceKey)).to.equal(true);
      const purged = await runPurgeStaging(
        new Date(Date.now() + PURGE_HORIZON_MS),
      );
      expect(purged).to.be.greaterThanOrEqual(1);
      expect(await FileExists(staged.resourceKey)).to.equal(false);
    });
  });
}

function describeStoredMetadata(): void {
  describe("stored names and sizes", () => {
    it("suggests free names for duplicates, ignoring case", async () => {
      await uploadPixelPng(client, folderId);
      const response = await client.post("/api/media/upload/names", {
        folderId,
        filenames: ["pixel.png", "PIXEL.png", "other.png"],
      });
      expect(response.status).to.equal(HTTP_OK);
      expect(response.data.names).to.deep.equal([
        "pixel (2).png",
        "PIXEL (3).png",
        null,
      ]);
    });

    it("stores the displayed size of an EXIF-rotated photo", async () => {
      const body = await sharp({
        create: { width: 20, height: 10, channels: 3, background: "blue" },
      })
        .jpeg()
        .withMetadata({ orientation: EXIF_ROTATED_RIGHT })
        .toBuffer();
      const asset = await uploadAsset(
        client,
        folderId,
        "portrait.jpg",
        "image/jpeg",
        body,
      );
      expect(asset.width).to.equal(10);
      expect(asset.height).to.equal(20);
    });
  });
}

describe("[integration] media upload policy — types, quota, real content and staging", () => {
  before(async function () {
    this.timeout(40_000);
    initialConfig = snapshotConfig();
    RegisterAssetBinding({
      id: PDF_BINDING_ID,
      folderName: PDF_FOLDER_NAME,
      field: { mimetypes: ["application/pdf"] },
    });
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    const folder = await client.post("/api/media/folders", {
      name: "Upload policy",
    });
    expect(folder.status).to.equal(HTTP_OK);
    folderId = readBody(folder, createdBody).id;
  });

  after(async () => {
    await client.delete(`/api/media/folders/${folderId}`);
    UnregisterAssetBinding(PDF_BINDING_ID);
    await removeLinkedFolders();
    configureMediaModule(initialConfig);
  });

  afterEach(() => {
    configureMediaModule(initialConfig);
  });

  describeTypeRules();
  describeQuota();
  describeContentChecks();
  describeStaging();
  describeStoredMetadata();
});
