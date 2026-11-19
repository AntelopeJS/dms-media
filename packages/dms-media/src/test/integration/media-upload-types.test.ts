import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { configureMediaModule, type DmsMediaConfig } from "../../config";
import { putPresigned, uploadAsset } from "../helpers/assets";
import { createdBody, presignBody, readBody } from "../helpers/bodies";
import { snapshotConfig } from "../helpers/config";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";
import {
  confirm,
  expectRefusal,
  presign,
  stage,
  storedBytes,
} from "../helpers/uploads";

const HTTP_OK = 200;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_REDIRECT_BOUNDARY = 300;
const PLAN_BYTES = 5000;
const FIRST_FILE_BYTES = 3000;
const LATE_FILE_BYTES = 1500;
const FILLING_FILE_BYTES = 1800;
const OVER_PLAN_BYTES = 2500;
const TYPE_NOT_ALLOWED = {
  status: HTTP_UNSUPPORTED_MEDIA_TYPE,
  reason: "type_not_allowed",
};
const ACTIVE_EXTENSIONS = [
  "htm",
  "html",
  "xhtml",
  "xht",
  "shtml",
  "mht",
  "mhtml",
  "php",
  "php3",
  "php4",
  "php5",
  "php7",
  "php8",
  "phps",
  "pht",
  "phtml",
  "phar",
  "HTM",
  "Php",
];
const ACTIVE_TYPES: [string, string][] = [
  ["page.txt", "text/html"],
  ["page.txt", "application/xhtml+xml"],
  ["run.txt", "application/x-httpd-php"],
  ["run.txt", "application/x-httpd-php-source"],
  ["run.txt", "application/x-php"],
  ["run.txt", "text/x-php"],
  ["page.txt", "TEXT/HTML; charset=utf-8"],
];
const DEFAULT_TYPES = [
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "application/pdf",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "audio/wav",
  "video/quicktime",
  "application/rtf",
  "text/plain",
  "text/markdown",
  "text/csv",
];
const UNLISTED_TYPES = [
  "application/zip",
  "application/json",
  "application/octet-stream",
];

let client: AxiosInstance;
let folderId: string;
let initialConfig: DmsMediaConfig;

function describeTypes(): void {
  describe("accepted types", () => {
    it("refuses every active-document type and extension, case aside, with a message", async () => {
      const attempts: [string, string][] = [
        ...ACTIVE_TYPES,
        ...ACTIVE_EXTENSIONS.map((extension): [string, string] => [
          `looks-plain.${extension}`,
          "text/plain",
        ]),
      ];
      for (const [name, mimetype] of attempts) {
        expectRefusal(
          await presign(client, folderId, name, mimetype),
          TYPE_NOT_ALLOWED,
          `${name} as ${mimetype}`,
        );
      }
      expect(
        (await presign(client, folderId, "notes.md", "text/markdown")).status,
      ).to.equal(HTTP_OK);
    });

    it("refuses at confirm a plain text upload confirmed under an .htm name", async () => {
      const staged = await stage(client, folderId, {
        filename: "ok.txt",
        mimetype: "text/plain",
        body: Buffer.from("<p>x</p>"),
      });
      expectRefusal(
        await confirm(client, folderId, staged.resourceKey, "page.htm"),
        TYPE_NOT_ALLOWED,
        "page.htm",
      );
    });

    it("accepts the default types and refuses the unlisted ones", async () => {
      for (const [index, mimetype] of DEFAULT_TYPES.entries()) {
        const response = await presign(
          client,
          folderId,
          `default-${index}.bin`,
          mimetype,
        );
        expect(response.status, mimetype).to.equal(HTTP_OK);
      }
      for (const mimetype of UNLISTED_TYPES) {
        const response = await presign(client, folderId, "other.bin", mimetype);
        expect(response.status, mimetype).to.equal(HTTP_UNSUPPORTED_MEDIA_TYPE);
      }
    });

    it("matches image/* as a prefix and refuses at confirm a PDF the library stopped accepting", async () => {
      const pdf = await stage(client, folderId, {
        filename: "late.pdf",
        mimetype: "application/pdf",
        body: Buffer.from("%PDF-1.4\n%%EOF\n"),
      });
      configureMediaModule({ ...initialConfig, allowedMimetypes: ["image/*"] });
      expect(
        (await presign(client, folderId, "a.webp", "image/webp")).status,
      ).to.equal(HTTP_OK);
      expectRefusal(
        await presign(client, folderId, "b.pdf", "application/pdf"),
        TYPE_NOT_ALLOWED,
        "a PDF",
      );
      expectRefusal(
        await confirm(client, folderId, pdf.resourceKey, "late.pdf"),
        TYPE_NOT_ALLOWED,
        "confirm",
      );
    });
  });
}

function describeQuota(): void {
  describe("storage quota", () => {
    it("tells the plan and what remains, at presign and at confirm, and accepts an upload that fills it exactly", async () => {
      const plan = (await storedBytes(client)) + PLAN_BYTES;
      configureMediaModule({ ...initialConfig, storageQuotaBytes: plan });
      await uploadAsset(
        client,
        folderId,
        "first.txt",
        "text/plain",
        Buffer.alloc(FIRST_FILE_BYTES, "a"),
      );
      const used = await storedBytes(client);
      const fitting = readBody(
        await presign(client, folderId, "b.txt", "text/plain", LATE_FILE_BYTES),
        presignBody,
      );
      const over = await presign(
        client,
        folderId,
        "c.txt",
        "text/plain",
        OVER_PLAN_BYTES,
      );
      expectRefusal(
        over,
        { status: HTTP_PAYLOAD_TOO_LARGE, reason: "quota" },
        "presign",
      );
      expect(over.data.quota).to.equal(plan);
      expect(over.data.remaining).to.equal(plan - used);
      await uploadAsset(
        client,
        folderId,
        "d.txt",
        "text/plain",
        Buffer.alloc(FILLING_FILE_BYTES, "d"),
      );
      const put = await putPresigned(
        fitting,
        Buffer.alloc(LATE_FILE_BYTES, "b"),
      );
      expect(put.status).to.be.lessThan(HTTP_REDIRECT_BOUNDARY);
      const late = await confirm(
        client,
        folderId,
        fitting.resourceKey,
        "b.txt",
      );
      const remaining = plan - used - FILLING_FILE_BYTES;
      expectRefusal(
        late,
        { status: HTTP_PAYLOAD_TOO_LARGE, reason: "quota" },
        "confirm",
      );
      expect(late.data.quota).to.equal(plan);
      expect(late.data.remaining).to.equal(remaining);
      expect(
        (await presign(client, folderId, "exact.txt", "text/plain", remaining))
          .status,
        "an upload that fills the plan exactly",
      ).to.equal(HTTP_OK);
      expect(
        (
          await presign(
            client,
            folderId,
            "one-more.txt",
            "text/plain",
            remaining + 1,
          )
        ).status,
        "one byte past the plan",
      ).to.equal(HTTP_PAYLOAD_TOO_LARGE);
    });
  });
}

describe("[integration] media upload types and storage plan", () => {
  before(async function () {
    this.timeout(40_000);
    initialConfig = snapshotConfig();
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    const folder = await client.post("/api/media/folders", {
      name: "Upload types",
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

  describeTypes();
  describeQuota();
});
