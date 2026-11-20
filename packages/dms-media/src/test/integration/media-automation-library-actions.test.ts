import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { deleteFileAction } from "../../automation/actions/delete-file";
import { deleteFolderAction } from "../../automation/actions/delete-folder";
import { ensureFolderAction } from "../../automation/actions/ensure-folder";
import { updateFileDetailsAction } from "../../automation/actions/file-details";
import { setFileVisibilityAction } from "../../automation/actions/file-visibility";
import { setFolderVisibilityAction } from "../../automation/actions/folder-visibility";
import { moveFileAction } from "../../automation/actions/move-file";
import { transformImageAction } from "../../automation/actions/transform-image";
import { filePublishedTrigger } from "../../automation/triggers/file-published";
import {
  addAssetBinding,
  bindingFolderId,
  removeAssetBinding,
} from "../../bindings";
import { MediaAssetModel, MediaEventModel, MediaFolderModel } from "../../db";
import { uploadAsset, uploadTextAsset } from "../helpers/assets";
import {
  capture,
  declaredFolder,
  failureOf,
  newTenant,
  stepCtx,
} from "../helpers/automation";
import { authorizedClient } from "../helpers/http";
import { createFolder } from "../helpers/media-api";
import { ensureOwnerSession } from "../helpers/owner";
import { solidPng } from "../helpers/png";

const TEST_TIMEOUT_MS = 30_000;
const IMAGE_BINDING = "automation-tests.library-covers";
const LOCKED_BINDING = "automation-tests.library-locked";

let client: AxiosInstance;
let rootId: string;

const assets = (tenantId = DEFAULT_TENANT_ID) =>
  GetModel(MediaAssetModel, tenantId);
const folders = (tenantId = DEFAULT_TENANT_ID) =>
  GetModel(MediaFolderModel, tenantId);

async function eventsOf(assetId: string) {
  return GetModel(MediaEventModel, DEFAULT_TENANT_ID).listByAsset(assetId);
}

function describeFileWrites(): void {
  describe("file writes", () => {
    it("renames and sets alt text, refusing a taken name, and simulates without writing", async () => {
      const file = await uploadTextAsset(client, rootId, "details.txt");
      await uploadTextAsset(client, rootId, "taken.txt");
      const simulated = await updateFileDetailsAction.dryRun?.(
        { assetId: file.id, name: "dry-renamed.txt" },
        stepCtx(),
      );
      expect(simulated).to.deep.include({ renamed: true });
      expect((await assets().get(file.id))?.name).to.equal("details.txt");
      const updated = await updateFileDetailsAction.execute(
        { assetId: file.id, name: "Renamed.txt", alt: "An alt" },
        stepCtx(),
      );
      expect(updated).to.deep.equal({
        assetId: file.id,
        name: "Renamed.txt",
        alt: "An alt",
        renamed: true,
        altChanged: true,
      });
      expect(
        await failureOf(
          updateFileDetailsAction.execute(
            { assetId: file.id, name: "TAKEN.txt" },
            stepCtx(),
          ),
        ),
      ).to.match(/another file of the folder has this name/);
      expect(
        await failureOf(
          updateFileDetailsAction.execute({ assetId: file.id }, stepCtx()),
        ),
      ).to.match(/give a name, an alt text or both/);
    });

    it("moves a file, reports a file already there, and fires file-published into a public folder", async () => {
      const file = await uploadTextAsset(client, rootId, "mover.txt");
      const target = await ensureFolderAction.execute(
        { parentId: rootId, name: "Public drop", visibility: "public" },
        stepCtx(),
      );
      const published = await capture(filePublishedTrigger, {
        includeAutomationWrites: true,
      });
      try {
        const moved = await moveFileAction.execute(
          { assetId: file.id, folderId: target.folderId },
          stepCtx(),
        );
        expect(moved).to.deep.include({
          moved: true,
          previousFolderId: rootId,
          effectiveVisibility: "public",
          previousEffectiveVisibility: "private",
        });
        expect(
          published.received.map((payload) => payload.reason),
        ).to.deep.equal(["move"]);
        const again = await moveFileAction.execute(
          { assetId: file.id, folderId: target.folderId },
          stepCtx(),
        );
        expect(again.moved).to.equal(false);
      } finally {
        await published.stop();
      }
    });

    it("sets a file's visibility, writing nothing when unchanged", async () => {
      const file = await uploadTextAsset(client, rootId, "visible.txt");
      const changed = await setFileVisibilityAction.execute(
        { assetId: file.id, visibility: "public" },
        stepCtx(),
      );
      expect(changed).to.deep.include({
        changed: true,
        previousVisibility: "inherit",
        effectiveVisibility: "public",
      });
      const eventCount = (await eventsOf(file.id)).length;
      const unchanged = await setFileVisibilityAction.execute(
        { assetId: file.id, visibility: "public" },
        stepCtx(),
      );
      expect(unchanged.changed).to.equal(false);
      expect(await eventsOf(file.id)).to.have.length(eventCount);
    });
  });
}

function describeFileWritesMore(): void {
  describe("file writes", () => {
    it("deletes a file once; the dry run and another tenant leave it live", async () => {
      const file = await uploadTextAsset(client, rootId, "doomed.txt");
      const otherTenant = await newTenant();
      expect(
        await failureOf(
          deleteFileAction.execute(
            { tenantId: otherTenant, assetId: file.id },
            stepCtx(),
          ),
        ),
      ).to.match(
        new RegExp(`File ${file.id} not found in tenant ${otherTenant}`),
      );
      await deleteFileAction.dryRun?.({ assetId: file.id }, stepCtx());
      expect((await assets().get(file.id))?.isDeleting).to.not.equal(true);
      const deleted = await deleteFileAction.execute(
        { assetId: file.id },
        stepCtx(),
      );
      expect(deleted).to.deep.include({ assetId: file.id, deleted: true });
      expect(
        await failureOf(
          deleteFileAction.execute({ assetId: file.id }, stepCtx()),
        ),
      ).to.match(/not found in tenant default/);
    });

    it("crops as a copy, rotates in place keeping the original, and simulates the same size", async () => {
      const source = await uploadAsset(
        client,
        rootId,
        "photo.png",
        "image/png",
        await solidPng(40, 20),
      );
      const crop = {
        assetId: source.id,
        cropX: 0,
        cropY: 0,
        cropWidth: 0.5,
        cropHeight: 1,
      };
      const simulated = await transformImageAction.dryRun?.(crop, stepCtx());
      const copy = await transformImageAction.execute(crop, stepCtx());
      expect(copy).to.deep.include({
        asCopy: true,
        sourceAssetId: source.id,
        width: 20,
        height: 20,
      });
      expect(copy.assetId).to.not.equal(source.id);
      expect([simulated?.width, simulated?.height]).to.deep.equal([20, 20]);
      expect((await assets().get(source.id))?.width).to.equal(40);
      const rotated = await transformImageAction.execute(
        { assetId: source.id, rotate: 90, asCopy: false },
        stepCtx(),
      );
      expect(rotated).to.deep.include({
        assetId: source.id,
        width: 20,
        height: 40,
      });
      expect((await assets().get(source.id))?.originalKey).to.be.a("string");
      expect(
        await failureOf(
          transformImageAction.execute(
            { assetId: source.id, cropX: 0 },
            stepCtx(),
          ),
        ),
      ).to.match(/give all four crop ports or none/);
      const svg = await uploadAsset(
        client,
        rootId,
        "logo.svg",
        "image/svg+xml",
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      );
      expect(
        await failureOf(
          transformImageAction.execute(
            { assetId: svg.id, rotate: 90 },
            stepCtx(),
          ),
        ),
      ).to.match(/cannot be edited/);
    });
  });
}

function describeFolderWrites(): void {
  describe("folder writes", () => {
    it("makes a folder public, counting the files that follow it", async () => {
      const folder = await createFolder(client, "Flip", rootId);
      await uploadTextAsset(client, folder, "a.txt");
      const own = await uploadTextAsset(client, folder, "own.txt");
      await setFileVisibilityAction.execute(
        { assetId: own.id, visibility: "private" },
        stepCtx(),
      );
      const simulated = await setFolderVisibilityAction.dryRun?.(
        { folderId: folder, visibility: "public" },
        stepCtx(),
      );
      expect((await folders().get(folder))?.visibility).to.equal("private");
      const changed = await setFolderVisibilityAction.execute(
        { folderId: folder, visibility: "public" },
        stepCtx(),
      );
      expect(changed).to.deep.equal({ ...simulated, changed: true });
      expect(changed.affectedFiles).to.equal(1);
      const unchanged = await setFolderVisibilityAction.execute(
        { folderId: folder, visibility: "public" },
        stepCtx(),
      );
      expect(unchanged).to.deep.include({ changed: false, affectedFiles: 0 });
    });

    it("deletes a folder tree with its counts, refusing a linked folder and a tree past maxFiles", async () => {
      const tree = await createFolder(client, "Tree", rootId);
      const branch = await createFolder(client, "Branch", tree);
      await uploadTextAsset(client, tree, "one.txt");
      await uploadTextAsset(client, branch, "two.txt");
      expect(
        await failureOf(
          deleteFolderAction.execute(
            { folderId: tree, maxFiles: 1 },
            stepCtx(),
          ),
        ),
      ).to.match(/holds 2 files, more than maxFiles \(1\)/);
      const simulated = await deleteFolderAction.dryRun?.(
        { folderId: tree },
        stepCtx(),
      );
      expect(await folders().get(tree)).to.not.equal(undefined);
      const deleted = await deleteFolderAction.execute(
        { folderId: tree },
        stepCtx(),
      );
      expect(deleted).to.deep.equal(simulated);
      expect(deleted).to.deep.include({ deletedFolders: 2, deletedFiles: 2 });
      expect(await folders().get(branch)).to.equal(undefined);
      expect(
        await failureOf(
          deleteFolderAction.execute(
            { folderId: bindingFolderId(DEFAULT_TENANT_ID, IMAGE_BINDING) },
            stepCtx(),
          ),
        ),
      ).to.match(/Linked folders cannot be restructured/);
    });

    it("acts in the tenant it is given only", async () => {
      const otherTenant = await newTenant();
      const otherFolder = await declaredFolder(otherTenant, "isolated");
      expect(
        await failureOf(
          setFolderVisibilityAction.execute(
            { folderId: otherFolder, visibility: "public" },
            stepCtx(),
          ),
        ),
      ).to.match(/Folder not found/);
      const changed = await setFolderVisibilityAction.execute(
        { tenantId: otherTenant, folderId: otherFolder, visibility: "public" },
        stepCtx(),
      );
      expect(changed.changed).to.equal(true);
    });
  });
}

describe("[integration] media automation — library write actions", function () {
  this.timeout(TEST_TIMEOUT_MS);

  before(async () => {
    addAssetBinding(IMAGE_BINDING, {
      id: IMAGE_BINDING,
      subfolders: true,
      field: { mimetypes: ["image/*"] },
    });
    addAssetBinding(LOCKED_BINDING, { id: LOCKED_BINDING });
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    rootId = await createFolder(client, "Library actions");
  });

  after(() => {
    removeAssetBinding(IMAGE_BINDING);
    removeAssetBinding(LOCKED_BINDING);
  });

  describeFileWrites();
  describeFileWritesMore();
  describeFolderWrites();
});
