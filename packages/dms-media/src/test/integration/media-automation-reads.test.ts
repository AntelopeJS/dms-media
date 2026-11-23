import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { createReadUrlAction } from "../../automation/actions/create-read-url";
import { getFileAction } from "../../automation/actions/get-file";
import { getStorageUsageAction } from "../../automation/actions/get-storage-usage";
import { listFolderFilesAction } from "../../automation/actions/list-folder-files";
import { searchFilesAction } from "../../automation/actions/search-files";
import { uploadAsset, uploadTextAsset } from "../helpers/assets";
import {
  declaredFolder,
  declaredText,
  failureOf,
  newTenant,
  stepCtx,
} from "../helpers/automation";
import { authorizedClient, getBaseUrl } from "../helpers/http";
import { createFolder, postOk } from "../helpers/media-api";
import { withMediaConfig } from "../helpers/media-config";
import { ensureOwnerSession } from "../helpers/owner";
import { solidPng } from "../helpers/png";

const TEST_TIMEOUT_MS = 30_000;

let client: AxiosInstance;
let rootId: string;
let nestedId: string;

function describeFileReads(): void {
  describe("media.get-file and media.create-read-url", () => {
    it("describes a file with its folder path, uploader and absolute links", async () => {
      const png = await uploadAsset(
        client,
        nestedId,
        "Été.png",
        "image/png",
        await solidPng(8, 6),
      );
      await postOk(client, `/assets/${png.id}/update`, { alt: "Summer" });
      const file = await getFileAction.execute({ assetId: png.id }, stepCtx());
      expect(file).to.deep.include({
        assetId: png.id,
        name: "Été.png",
        typeGroup: "image",
        width: 8,
        height: 6,
        alt: "Summer",
        visibility: "inherit",
        effectiveVisibility: "private",
        folderId: nestedId,
        folderName: "Nested",
        folderPath: "Reads/Nested",
        binding: null,
        isEdited: false,
        uploaderName: "Test Owner",
        deliveryPath: `/media/${png.id}/%C3%89t%C3%A9.png`,
      });
      expect(file.storedSize).to.equal(file.size);
      expect(file.deliveryUrl).to.match(
        new RegExp(`^https?://[^/]+/media/${png.id}/%C3%89t%C3%A9\\.png$`),
      );
      expect(file.dashboardUrl).to.equal(
        `${getBaseUrl()}/modules/media/file?asset=${png.id}`,
      );
      expect(getFileAction.sideEffects).to.equal(false);
    });

    it("fails for a file of another tenant", async () => {
      const file = await uploadTextAsset(client, rootId, "mine.txt");
      const otherTenant = await newTenant();
      expect(
        await failureOf(
          getFileAction.execute(
            { tenantId: otherTenant, assetId: file.id },
            stepCtx(),
          ),
        ),
      ).to.match(
        new RegExp(`File ${file.id} not found in tenant ${otherTenant}`),
      );
    });
  });
}

function describeFileReadsMore(): void {
  describe("media.get-file and media.create-read-url", () => {
    it("signs a fetchable link to the original and to an image size, within the lifetime bounds", async () => {
      const png = await uploadAsset(
        client,
        rootId,
        "signed.png",
        "image/png",
        await solidPng(64, 64),
      );
      const original = await createReadUrlAction.execute(
        { assetId: png.id },
        stepCtx(),
      );
      expect((await fetch(original.url)).status).to.equal(200);
      expect(original).to.deep.include({
        name: "signed.png",
        effectiveVisibility: "private",
      });
      const thumb = await createReadUrlAction.execute(
        { assetId: png.id, preset: "thumb", expiresInSeconds: 60 },
        stepCtx(),
      );
      expect((await fetch(thumb.url)).status).to.equal(200);
      expect(
        await failureOf(
          createReadUrlAction.execute(
            { assetId: png.id, expiresInSeconds: 30 },
            stepCtx(),
          ),
        ),
      ).to.match(/expiresInSeconds/);
      const pastCeiling = await withMediaConfig(
        { automation: { readUrlMaxTtlSeconds: 120 } },
        () =>
          failureOf(
            createReadUrlAction.execute(
              { assetId: png.id, expiresInSeconds: 3600 },
              stepCtx(),
            ),
          ),
      );
      expect(pastCeiling).to.match(/at most 120 seconds/);
      expect(
        await failureOf(
          createReadUrlAction.execute(
            { assetId: png.id, preset: "nope" },
            stepCtx(),
          ),
        ),
      ).to.match(/Unknown preset/);
    });

    it("refuses a size of a PDF and a signed link to an SVG original", async () => {
      const pdf = await uploadAsset(
        client,
        rootId,
        "doc.pdf",
        "application/pdf",
        Buffer.from("%PDF-1.4\n"),
      );
      expect(
        await failureOf(
          createReadUrlAction.execute(
            { assetId: pdf.id, preset: "thumb" },
            stepCtx(),
          ),
        ),
      ).to.match(/Derivatives only exist for images/);
      const svg = await uploadAsset(
        client,
        rootId,
        "icon.svg",
        "image/svg+xml",
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>',
        ),
      );
      expect(
        await failureOf(
          createReadUrlAction.execute({ assetId: svg.id }, stepCtx()),
        ),
      ).to.match(/SVG or XML original is refused/);
    });
  });
}

function describeListings(): void {
  describe("media.list-folder-files and media.search-files", () => {
    it("pages a folder's files, with subfolders on request and a type filter", async () => {
      const folder = await createFolder(client, "Paged", rootId);
      const sub = await createFolder(client, "Deeper", folder);
      for (const name of ["c.txt", "a.txt", "b.txt"])
        await uploadTextAsset(client, folder, name);
      await uploadTextAsset(client, sub, "d.txt");
      await uploadAsset(
        client,
        folder,
        "e.png",
        "image/png",
        await solidPng(2, 2),
      );
      const first = await listFolderFilesAction.execute(
        { folderId: folder, limit: 2, type: "document" },
        stepCtx(),
      );
      expect(first.files.map((file) => file.name)).to.deep.equal([
        "a.txt",
        "b.txt",
      ]);
      expect([first.total, first.hasMore]).to.deep.equal([3, true]);
      const all = await listFolderFilesAction.execute(
        {
          folderId: folder,
          includeSubfolders: true,
          sort: "name",
          direction: "desc",
        },
        stepCtx(),
      );
      expect(all.files.map((file) => file.name)).to.deep.equal([
        "e.png",
        "d.txt",
        "c.txt",
        "b.txt",
        "a.txt",
      ]);
      expect(all.hasMore).to.equal(false);
    });

    it("finds files by accent- and case-free words of the name, folder path or alt text", async () => {
      const folder = await createFolder(client, "Café menus", rootId);
      const summer = await uploadTextAsset(client, folder, "Été 2026.txt");
      const other = await uploadTextAsset(client, rootId, "plain.txt");
      await postOk(client, `/assets/${other.id}/update`, {
        alt: "Menu du soir",
      });
      const byName = await searchFilesAction.execute(
        { query: "ete" },
        stepCtx(),
      );
      expect(byName.files.map((file) => file.assetId)).to.include(summer.id);
      const narrowed = await searchFilesAction.execute(
        { query: "cafe 2026" },
        stepCtx(),
      );
      expect(narrowed.files.map((file) => file.assetId)).to.deep.equal([
        summer.id,
      ]);
      const byAlt = await searchFilesAction.execute(
        { query: "SOIR", folderId: rootId },
        stepCtx(),
      );
      expect(byAlt.files).to.have.length(1);
      expect(byAlt.files[0]).to.deep.include({
        assetId: other.id,
        matchedOn: "alt",
      });
      const scoped = await searchFilesAction.execute(
        { query: "soir", folderId: folder },
        stepCtx(),
      );
      expect(scoped.total).to.equal(0);
    });
  });
}

function describeUsage(): void {
  describe("media.get-storage-usage", () => {
    it("measures a tenant's stored bytes by type against its plan, null figures without one", async () => {
      const tenantId = await newTenant();
      await declaredFolder(tenantId, "usage");
      await declaredText(tenantId, "usage", "a.txt", 300);
      await declaredText(tenantId, "usage", "b.txt", 100);
      const unplanned = await getStorageUsageAction.execute(
        { tenantId },
        stepCtx(),
      );
      expect(unplanned).to.deep.equal({
        usedBytes: 400,
        fileCount: 2,
        quotaBytes: null,
        percent: null,
        remainingBytes: null,
        byType: [{ group: "document", files: 2, bytes: 400 }],
      });
      await withMediaConfig({ storageQuotaBytes: 1600 }, async () => {
        const planned = await getStorageUsageAction.execute(
          { tenantId },
          stepCtx(),
        );
        expect(planned).to.deep.include({
          quotaBytes: 1600,
          percent: 25,
          remainingBytes: 1200,
        });
      });
      const defaultTenant = await getStorageUsageAction.execute({}, stepCtx());
      expect(defaultTenant.usedBytes).to.be.greaterThan(0);
    });
  });
}

describe("[integration] media automation — reads", function () {
  this.timeout(TEST_TIMEOUT_MS);

  before(async () => {
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    rootId = await createFolder(client, "Reads");
    nestedId = await createFolder(client, "Nested", rootId);
  });

  describeFileReads();
  describeFileReadsMore();
  describeListings();
  describeUsage();
});
