import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Schema } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  DEFAULT_TENANT_ID,
  TENANT_SCHEMA_NAME,
} from "@antelopejs/interface-dms/constants";
import {
  Hook,
  RegisterHook,
  type TenantProvisioningHookPayload,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import { ProvisionTenant } from "@antelopejs/interface-dms/tenant-provisioning";
import {
  EnsureMediaFolder,
  ImportMediaAsset,
} from "@antelopejs/interface-dms-media";
import { FileExists } from "@antelopejs/interface-file-storage";
import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import sharp from "sharp";
import { MediaAssetModel, MediaEventModel, MediaFolderModel } from "../../db";
import { PNG_MIMETYPE, uploadTextAsset } from "../helpers/assets";
import { readBody, urlBody } from "../helpers/bodies";
import { authorizedClient } from "../helpers/http";
import { ensureOwnerSession } from "../helpers/owner";

const HTTP_OK = 200;
const ROOT_KEY = "declared-sources.root";

function folders() {
  return GetModel(MediaFolderModel, DEFAULT_TENANT_ID);
}

function assets() {
  return GetModel(MediaAssetModel, DEFAULT_TENANT_ID);
}

async function storedBytes(assetId: string): Promise<Buffer> {
  const readUrl = await client.get(`/api/media/assets/${assetId}/read-url`);
  expect(readUrl.status).to.equal(HTTP_OK);
  const stored = await fetch(readBody(readUrl, urlBody).url);
  return Buffer.from(await stored.arrayBuffer());
}

function readStorageDir(): string {
  const dir = process.env.TEST_STORAGE_DIR;
  if (!dir) throw new Error("TEST_STORAGE_DIR is not set by the test setup");
  return dir;
}

let client: AxiosInstance;
let tempDir: string;

function describeDeclaredFileDetails(): void {
  describe("declared file details", () => {
    it("reads a lazy source once, at its decoded size, and records the upload as System's", async () => {
      const png = await sharp({
        create: { width: 640, height: 480, channels: 3, background: "#336699" },
      })
        .png()
        .toBuffer();
      let loads = 0;
      const result = await ImportMediaAsset({
        tenantId: DEFAULT_TENANT_ID,
        key: "declared.once-loaded",
        folder: { key: ROOT_KEY },
        name: "Plan été.png",
        mimetype: PNG_MIMETYPE,
        source: {
          load: () => {
            loads++;
            return png;
          },
        },
      });
      expect(result.status).to.equal("created");
      expect(loads, "the source of a new file is read once").to.equal(1);
      const asset = await assets().get(result.id);
      expect([asset?.width, asset?.height]).to.deep.equal([640, 480]);
      const events = await GetModel(
        MediaEventModel,
        DEFAULT_TENANT_ID,
      ).listByAsset(result.id);
      expect(events.map((event) => event.actorName)).to.deep.equal(["System"]);
    });

    it("stores a long text byte for byte from bytes, a path and a load function", async () => {
      const text = Buffer.from(
        Array.from(
          { length: 6000 },
          (_, line) => `ligne ${line} : été, naïve, 東京, €\n`,
        ).join(""),
      );
      const filePath = join(tempDir, "long.txt");
      await writeFile(filePath, text);
      const sources = {
        bytes: { bytes: text },
        filePath: { filePath },
        load: { load: () => text },
      };
      for (const [kind, source] of Object.entries(sources)) {
        const result = await ImportMediaAsset({
          tenantId: DEFAULT_TENANT_ID,
          key: `declared.source-${kind}`,
          folder: { key: ROOT_KEY },
          name: `${kind} — été.txt`,
          mimetype: "text/plain",
          source,
        });
        expect(result.status, kind).to.equal("created");
        expect(await storedBytes(result.id), kind).to.deep.equal(text);
      }
    });

    it("stores declared and uploaded files under media/<tenant>/<folder>/ in the file storage", async () => {
      const folder = await EnsureMediaFolder({
        tenantId: DEFAULT_TENANT_ID,
        key: "declared.paths",
        name: "Declared paths",
      });
      const declared = await ImportMediaAsset({
        tenantId: DEFAULT_TENANT_ID,
        key: "declared.paths.file",
        folder: { key: "declared.paths" },
        name: "chemin.txt",
        mimetype: "text/plain",
        source: { bytes: Buffer.from("chemin") },
      });
      const uploaded = await uploadTextAsset(client, folder.id, "envoi.txt");
      const folderPath = `media/${DEFAULT_TENANT_ID}/${folder.id}`;
      const files = join(readStorageDir(), "files");
      const declaredAsset = await assets().get(declared.id);
      const uploadedAsset = await assets().get(uploaded.id);
      assert.isDefined(declaredAsset, "the declared file");
      assert.isDefined(uploadedAsset, "the uploaded file");
      expect(
        existsSync(join(files, folderPath, declaredAsset.storageKey)),
        "the declared file is stored under the tenant and folder",
      ).to.equal(true);
      expect(uploadedAsset.storageKey).to.match(new RegExp(`^${folderPath}/`));
      for (const asset of [declaredAsset, uploadedAsset]) {
        expect(await FileExists(asset.storageKey), asset.storageKey).to.equal(
          true,
        );
      }
    });

    it("trims the tenant id, and creates the folder in that tenant", async () => {
      const result = await EnsureMediaFolder({
        tenantId: "  default  ",
        key: "declared.trimmed-tenant",
        name: "Trimmed tenant",
      });
      expect(result.status).to.equal("created");
      expect((await folders().get(result.id))?.name).to.equal("Trimmed tenant");
    });
  });
}

function describeTenantProvisioning(): void {
  describe("tenant provisioning", () => {
    it("ships the folder and file a Hook.TENANT_BEING_PROVISIONED handler declares into the new tenant, as System's", async () => {
      const tenantId = "declared-provisioned";
      const handler = async (payload: TenantProvisioningHookPayload) => {
        if (payload.tenantId !== tenantId) return;
        await EnsureMediaFolder({
          tenantId,
          key: "provisioned",
          name: "Provisioned",
        });
        await ImportMediaAsset({
          tenantId,
          key: "provisioned.procedure",
          folder: { key: "provisioned" },
          name: "procedure.txt",
          mimetype: "text/plain",
          source: { bytes: Buffer.from("Check the harness before you climb.") },
        });
      };
      RegisterHook(Hook.TENANT_BEING_PROVISIONED, handler);
      try {
        await ProvisionTenant({ tenantId, extras: {} });
        const folder = (
          await GetModel(MediaFolderModel, tenantId).getAll()
        ).find((entry) => entry.name === "Provisioned");
        assert.isDefined(folder, "the provisioned folder");
        const files = await GetModel(MediaAssetModel, tenantId).getAll();
        expect(files.map((file) => [file.name, file.folderId])).to.deep.equal([
          ["procedure.txt", folder._id],
        ]);
        const events = await GetModel(MediaEventModel, tenantId).listByAsset(
          files[0]?._id ?? "",
        );
        expect(events.map((event) => event.actorName)).to.deep.equal([
          "System",
        ]);
      } finally {
        UnregisterHook(Hook.TENANT_BEING_PROVISIONED, handler);
        await Schema.get(TENANT_SCHEMA_NAME)?.destroyInstance(tenantId).run();
      }
    });
  });
}

describe("[integration] media declared content — sources, storage paths and tenant provisioning", () => {
  before(async function () {
    this.timeout(40_000);
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    tempDir = await mkdtemp(join(tmpdir(), "dms-media-declared-sources-"));
    await EnsureMediaFolder({
      tenantId: DEFAULT_TENANT_ID,
      key: ROOT_KEY,
      name: "Declared sources root",
    });
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describeDeclaredFileDetails();
  describeTenantProvisioning();
});
