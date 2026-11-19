import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  EnsureMediaFolder,
  ImportMediaAsset,
  type MediaAssetDeclaration,
  type MediaFolderDeclaration,
  RegisterAssetBinding,
} from "@antelopejs/interface-dms-media";
import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import sharp from "sharp";
import { MediaAssetModel, MediaFolderModel } from "../../db";
import { PNG_MIMETYPE } from "../helpers/assets";
import { withMediaConfig } from "../helpers/media-config";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const BINDING_ID = "declared-rules.covers";
const ROOT_KEY = "declared-rules.root";

function folders() {
  return GetModel(MediaFolderModel, DEFAULT_TENANT_ID);
}

function assets() {
  return GetModel(MediaAssetModel, DEFAULT_TENANT_ID);
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    assert.instanceOf(error, Error);
    return error;
  }
  throw new Error("Expected the declaration to be refused");
}

async function reasonOf(
  promise: Promise<unknown>,
  kind: "folder" | "file",
  key: string,
): Promise<string> {
  const prefix = `Media ${kind} '${key}': `.normalize("NFC");
  const message = (await rejectionOf(promise)).message.normalize("NFC");
  assert.isTrue(message.startsWith(prefix), message);
  return message.slice(prefix.length);
}

const FORBIDDEN_NAME_REASON =
  "name: a name can't contain / \\ < > : \" | ? * or control characters";
const NAME_TOO_LONG_REASON = "name: the name is limited to 255 characters";
const FORBIDDEN_CHARACTERS = [
  "/",
  "\\",
  "<",
  ">",
  ":",
  '"',
  "|",
  "?",
  "*",
  "\u0007",
];
const LIBRARY_REFUSES_TYPE = "This type of file can't be added to the library";

let client: AxiosInstance;
let tempDir: string;

function describeFolderNameRules(): void {
  describe("folder names", () => {
    it("refuses every character and length the dashboard refuses, with its reason", async () => {
      const refused: string[] = [];
      for (const character of FORBIDDEN_CHARACTERS) {
        const key = `rules.forbidden-${character.codePointAt(0)}`;
        const name = `a${character}b`;
        refused.push(name);
        expect(
          await reasonOf(
            EnsureMediaFolder({ tenantId: DEFAULT_TENANT_ID, key, name }),
            "folder",
            key,
          ),
          JSON.stringify(name),
        ).to.equal(FORBIDDEN_NAME_REASON);
      }
      const longName = "n".repeat(256);
      expect(
        await reasonOf(
          EnsureMediaFolder({
            tenantId: DEFAULT_TENANT_ID,
            key: "rules.too-long",
            name: longName,
          }),
          "folder",
          "rules.too-long",
        ),
      ).to.equal(NAME_TOO_LONG_REASON);
      const names = (await folders().getAll()).map((folder) => folder.name);
      for (const name of [...refused, longName]) {
        expect(names, "no refused folder is created").to.not.include(name);
      }
    });

    it("refuses a sibling's name in any case or Unicode form, and allows it in another folder", async () => {
      const name = "Été rules";
      const parent = await EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
        key: "rules.twin-parent",
        name,
      });
      expect(parent.status).to.equal("created");
      const decomposed = name.normalize("NFD");
      expect(
        await reasonOf(
          EnsureMediaFolder({
            tenantId: DEFAULT_TENANT_ID,
            key: "rules.twin-nfd",
            name: decomposed,
          }),
          "folder",
          "rules.twin-nfd",
        ),
      ).to.equal(`a folder named '${name}' already exists there`);
      const child = {
        tenantId: DEFAULT_TENANT_ID,
        parent: "rules.twin-parent",
      };
      await EnsureMediaFolder({ ...child, key: "rules.twin", name: "Twin" });
      expect(
        await reasonOf(
          EnsureMediaFolder({ ...child, key: "rules.twin-caps", name: "TWIN" }),
          "folder",
          "rules.twin-caps",
        ),
      ).to.equal("a folder named 'TWIN' already exists there");
      const inside = await EnsureMediaFolder({
        ...child,
        key: "rules.twin-inside",
        name,
      });
      expect(inside.status).to.equal("created");
    });
  });
}

function describeFolderTargetRules(): void {
  describe("folder targets and keys", () => {
    it("names the parent, binding or ACL entry a declaration gets wrong", async () => {
      const refusal = (key: string, extra: Partial<MediaFolderDeclaration>) =>
        reasonOf(
          EnsureMediaFolder({
            tenantId: DEFAULT_TENANT_ID,
            key,
            name: key,
            ...extra,
          }),
          "folder",
          key,
        );
      expect(
        await refusal("rules.orphan", { parent: "rules.nowhere" }),
      ).to.equal(
        "'rules.nowhere' is not a declared folder: declare it with EnsureMediaFolder first",
      );
      expect(await refusal("rules.self", { parent: "rules.self" })).to.equal(
        "a folder cannot be its own parent",
      );
      const doomed = await EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
        key: "rules.doomed",
        name: "Doomed",
      });
      const deleted = await client.delete(`/api/media/folders/${doomed.id}`);
      expect(deleted.status).to.equal(HTTP_OK);
      expect(await refusal("rules.under", { parent: "rules.doomed" })).to.equal(
        "the folder declared as 'rules.doomed' was deleted",
      );
      expect(
        await refusal("rules.acl", {
          acl: [{ subject: { kind: "permission", id: "x" }, rights: [] }],
        }),
      ).to.match(/^acl\.0\.rights: .+/);
      const names = (await folders().getAll()).map((folder) => folder.name);
      for (const refused of [
        "rules.orphan",
        "rules.self",
        "rules.under",
        "rules.acl",
      ]) {
        expect(names, "no refused folder is created").to.not.include(refused);
      }
    });

    it("trims the key, and takes 1 to 255 characters", async () => {
      const spaced = await EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
        key: "  rules.spaced  ",
        name: "Spaced",
      });
      const plain = await EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
        key: "rules.spaced",
        name: "Spaced again",
      });
      expect(spaced.status).to.equal("created");
      expect(plain).to.deep.equal({ status: "kept", id: spaced.id });
      for (const key of ["   ", "k".repeat(256)]) {
        expect(
          await reasonOf(
            EnsureMediaFolder({
              tenantId: DEFAULT_TENANT_ID,
              key,
              name: "Bad key",
            }),
            "folder",
            key,
          ),
        ).to.match(/^key: .+/);
      }
      const longest = await EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
        key: "m".repeat(255),
        name: "Longest key",
      });
      expect(longest.status).to.equal("created");
    });
  });
}

function describeFileRules(): void {
  describe("file rules", () => {
    const declare = (suffix: string, fields: Partial<MediaAssetDeclaration>) =>
      ImportMediaAsset({
        tenantId: DEFAULT_TENANT_ID,
        key: `rules.file-${suffix}`,
        folder: { key: ROOT_KEY },
        name: "ok.txt",
        mimetype: "text/plain",
        source: { bytes: Buffer.from("ok") },
        ...fields,
      });
    const refusal = (suffix: string, fields: Partial<MediaAssetDeclaration>) =>
      reasonOf(declare(suffix, fields), "file", `rules.file-${suffix}`);

    it("refuses a name with / \\ or a control character, or over 255 characters, as the dashboard does", async () => {
      for (const [index, name] of [
        "a/b.txt",
        "a\\b.txt",
        "a\u0001b.txt",
      ].entries()) {
        expect(await refusal(`name-${index}`, { name }), name).to.equal(
          FORBIDDEN_NAME_REASON,
        );
      }
      expect(
        await refusal("name-long", { name: `${"n".repeat(252)}.txt` }),
      ).to.equal(NAME_TOO_LONG_REASON);
    });

    it("accepts a colon, an alt and a name of 255 characters", async () => {
      for (const [suffix, fields] of Object.entries({
        colon: { name: "a:b.txt" },
        alt: { alt: "a".repeat(255) },
        name: { name: `${"n".repeat(251)}.txt` },
      })) {
        expect((await declare(`ok-${suffix}`, fields)).status, suffix).to.equal(
          "created",
        );
      }
    });

    it("refuses an empty file and an alt over 255 characters", async () => {
      expect(
        await refusal("empty", { source: { bytes: Buffer.alloc(0) } }),
      ).to.equal("declaration: the file is empty");
      expect(await refusal("alt", { alt: "a".repeat(256) })).to.equal(
        "alt: the alt text is limited to 255 characters",
      );
    });

    it("names the folder a file is declared into when it was never declared", async () => {
      expect(
        await refusal("nofolder", { folder: { key: "rules.missing" } }),
      ).to.equal(
        "'rules.missing' is not a declared folder: declare it with EnsureMediaFolder first",
      );
    });
  });
}

function describeUploadLimits(): void {
  describe("the limits of an upload", () => {
    const declare = (suffix: string, fields: Partial<MediaAssetDeclaration>) =>
      reasonOf(
        ImportMediaAsset({
          tenantId: DEFAULT_TENANT_ID,
          key: `limits.${suffix}`,
          folder: { key: ROOT_KEY },
          name: "x.txt",
          mimetype: "text/plain",
          source: { bytes: Buffer.from("x") },
          ...fields,
        }),
        "file",
        `limits.${suffix}`,
      );

    it("refuses a file over 524288000 bytes", async function () {
      this.timeout(60_000);
      const path = join(tempDir, "big.bin");
      const handle = await open(path, "w");
      await handle.truncate(500 * 1024 * 1024 + 1);
      await handle.close();
      expect(
        await declare("big", {
          name: "big.pdf",
          mimetype: "application/pdf",
          source: { filePath: path },
        }),
      ).to.equal("declaration: the file exceeds 524288000 bytes");
    });

    it("refuses the types the library refuses, an unreadable image and a bound field's other types", async () => {
      const html = { name: "page.htm", source: { bytes: Buffer.from("<p>") } };
      expect(await declare("htm", html), "html under another type").to.equal(
        LIBRARY_REFUSES_TYPE,
      );
      expect(
        await declare("exe", {
          name: "tool.exe",
          mimetype: "application/x-msdownload",
        }),
      ).to.equal(LIBRARY_REFUSES_TYPE);
      expect(
        await declare("field", { folder: { binding: BINDING_ID } }),
      ).to.equal("This folder feeds a field that only accepts image/*");
      expect(
        await declare("broken", {
          name: "broken.jpg",
          mimetype: "image/jpeg",
          source: { bytes: Buffer.from("nope") },
        }),
      ).to.equal("This file is not a readable image");
    });

    it("refuses a file once the storage plan is full", async () => {
      await withMediaConfig({ storageQuotaBytes: 1 }, async () => {
        expect(
          await declare("quota", { source: { bytes: Buffer.alloc(64, 97) } }),
        ).to.equal("The library's storage plan is full");
      });
    });

    it("stores a JPEG declared as a PNG under its decoded type", async () => {
      const jpeg = await sharp({
        create: { width: 9, height: 7, channels: 3, background: "#cc3333" },
      })
        .jpeg()
        .toBuffer();
      const result = await ImportMediaAsset({
        tenantId: DEFAULT_TENANT_ID,
        key: "limits.claimed",
        folder: { key: ROOT_KEY },
        name: "really-jpeg.png",
        mimetype: PNG_MIMETYPE,
        source: { bytes: jpeg },
      });
      const asset = await assets().get(result.id);
      expect([asset?.mimetype, asset?.width]).to.deep.equal(["image/jpeg", 9]);
    });
  });
}

describe("[integration] media declared content — the rules a declaration follows", () => {
  before(async function () {
    this.timeout(40_000);
    RegisterAssetBinding({
      id: BINDING_ID,
      folderName: "Declared rules covers",
      field: { mimetypes: ["image/*"] },
    });
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    tempDir = await mkdtemp(join(tmpdir(), "dms-media-declared-rules-"));
    await EnsureMediaFolder({
      tenantId: DEFAULT_TENANT_ID,
      key: ROOT_KEY,
      name: "Declared rules root",
    });
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describeFolderNameRules();
  describeFolderTargetRules();
  describeFileRules();
  describeUploadLimits();
});
