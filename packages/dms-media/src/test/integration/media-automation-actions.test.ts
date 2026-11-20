import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { createFileAction } from "../../automation/actions/create-file";
import { deleteFileAction } from "../../automation/actions/delete-file";
import { ensureFolderAction } from "../../automation/actions/ensure-folder";
import {
  addAssetBinding,
  bindingFolderId,
  removeAssetBinding,
} from "../../bindings";
import { MediaAssetModel, MediaEventModel, MediaFolderModel } from "../../db";
import { failureOf, newTenant, stepCtx } from "../helpers/automation";
import { authorizedClient } from "../helpers/http";
import { createFolder } from "../helpers/media-api";
import { withMediaConfig } from "../helpers/media-config";
import { ensureOwnerSession } from "../helpers/owner";
import { solidPng } from "../helpers/png";

const TEST_TIMEOUT_MS = 30_000;
const IMAGE_BINDING = "automation-tests.covers";
const LOCKED_BINDING = "automation-tests.locked";

let client: AxiosInstance;
let rootId: string;

const assets = (tenantId = DEFAULT_TENANT_ID) =>
  GetModel(MediaAssetModel, tenantId);
const folders = (tenantId = DEFAULT_TENANT_ID) =>
  GetModel(MediaFolderModel, tenantId);

async function eventsOf(assetId: string) {
  return GetModel(MediaEventModel, DEFAULT_TENANT_ID).listByAsset(assetId);
}

function describeCreateFile(): void {
  describe("media.create-file", () => {
    it("creates a CSV by folder id, attributed to Automation with the procedure step", async () => {
      const ctx = stepCtx("procedure-create");
      const created = await createFileAction.execute(
        {
          folderId: rootId,
          name: "export.csv",
          content: "a,b\n1,2\n",
          mimetype: "text/csv",
        },
        ctx,
      );
      expect(created).to.deep.include({
        status: "created",
        name: "export.csv",
        mimetype: "text/csv",
        size: 8,
        folderId: rootId,
      });
      const [event] = await eventsOf(created.assetId);
      expect(event?.actorName).to.equal("Automation");
      expect(event?.json_details).to.contain(
        '"procedureId":"procedure-create"',
      );
    });

    it("creates a base64 PNG in a linked folder by binding, with its probed size", async () => {
      const png = await solidPng(30, 20);
      const created = await createFileAction.execute(
        {
          binding: IMAGE_BINDING,
          name: "cover.png",
          content: png.toString("base64"),
          encoding: "base64",
          mimetype: "image/png",
        },
        stepCtx(),
      );
      expect(created).to.deep.include({
        folderId: bindingFolderId(DEFAULT_TENANT_ID, IMAGE_BINDING),
        width: 30,
        height: 20,
      });
    });

    it("renames on a clash by default and refuses it with `fail`", async () => {
      const input = {
        folderId: rootId,
        name: "clash.txt",
        content: "x",
        mimetype: "text/plain",
      };
      await createFileAction.execute(input, stepCtx());
      const renamed = await createFileAction.execute(input, stepCtx());
      expect(renamed.name).to.equal("clash (2).txt");
      expect(
        await failureOf(
          createFileAction.execute(
            { ...input, onNameConflict: "fail" },
            stepCtx(),
          ),
        ),
      ).to.match(/media.create-file: another file of the folder has this name/);
    });
  });
}

function describeCreateFileMore(): void {
  describe("media.create-file", () => {
    it("refuses refused types, a field's types, bad base64, an empty file and a full plan", async () => {
      const base = {
        folderId: rootId,
        name: "page.txt",
        content: "x",
        mimetype: "text/plain",
      };
      expect(
        await failureOf(
          createFileAction.execute(
            { ...base, name: "page.html", mimetype: "text/html" },
            stepCtx(),
          ),
        ),
      ).to.match(/can't be added to the library/);
      expect(
        await failureOf(
          createFileAction.execute(
            { ...base, folderId: undefined, binding: IMAGE_BINDING },
            stepCtx(),
          ),
        ),
      ).to.match(/only accepts image/);
      expect(
        await failureOf(
          createFileAction.execute(
            { ...base, content: "@@@", encoding: "base64" },
            stepCtx(),
          ),
        ),
      ).to.match(/content: not valid base64/);
      expect(
        await failureOf(
          createFileAction.execute({ ...base, content: "" }, stepCtx()),
        ),
      ).to.match(/content: the file must hold 1 to 1048576 bytes/);
      const overPlan: string = await withMediaConfig(
        { storageQuotaBytes: 1 },
        () => failureOf(createFileAction.execute(base, stepCtx())),
      );
      expect(overPlan).to.match(/storage plan is full/);
    });

    it("keeps the file of a key used again, and creates it anew once deleted", async () => {
      const input = {
        folderId: rootId,
        name: "keyed.txt",
        content: "k",
        mimetype: "text/plain",
        key: "nightly-report",
      };
      const [first, concurrent] = await Promise.all([
        createFileAction.execute(input, stepCtx()),
        createFileAction.execute(input, stepCtx()),
      ]);
      expect([first.status, concurrent.status].sort()).to.deep.equal([
        "created",
        "kept",
      ]);
      expect(concurrent.assetId).to.equal(first.assetId);
      await deleteFileAction.execute({ assetId: first.assetId }, stepCtx());
      const again = await createFileAction.execute(input, stepCtx());
      expect(again.status).to.equal("created");
      expect(again.assetId).to.not.equal(first.assetId);
      const kept = await createFileAction.execute(input, stepCtx());
      expect(kept).to.deep.include({ status: "kept", assetId: again.assetId });
    });

    it("simulates without writing, returning the id the keyed run will use", async () => {
      const input = {
        folderId: rootId,
        name: "simulated.txt",
        content: "s",
        mimetype: "text/plain",
        key: "simulated-key",
      };
      const ctx = stepCtx();
      const before = (await assets().getBy("folderId", rootId)).length;
      const simulated = await createFileAction.dryRun?.(input, ctx);
      expect((await assets().getBy("folderId", rootId)).length).to.equal(
        before,
      );
      expect(ctx.logged[0]?.message).to.match(
        /^Simulated \(test run\): creation of file/,
      );
      const created = await createFileAction.execute(input, stepCtx());
      expect(simulated).to.deep.equal(created);
    });
  });
}

function describeCreateFileFurther(): void {
  describe("media.create-file", () => {
    it("refuses another tenant's folder and an unknown tenant, writing nothing", async () => {
      const otherTenant = await newTenant();
      expect(
        await failureOf(
          createFileAction.execute(
            {
              tenantId: otherTenant,
              folderId: rootId,
              name: "x.txt",
              content: "x",
              mimetype: "text/plain",
            },
            stepCtx(),
          ),
        ),
      ).to.match(/Folder not found/);
      expect(await assets(otherTenant).getAll()).to.deep.equal([]);
      expect(
        await failureOf(
          createFileAction.execute(
            {
              tenantId: "no-such-tenant",
              folderId: rootId,
              name: "x.txt",
              content: "x",
              mimetype: "text/plain",
            },
            stepCtx(),
          ),
        ),
      ).to.match(/unknown tenant "no-such-tenant"/);
      expect(await folders("no-such-tenant").getAll()).to.deep.equal([]);
    });
  });
}

function describeEnsureFolder(): void {
  describe("media.ensure-folder", () => {
    it("creates once under a parent and finds it again whatever the case, concurrent calls included", async () => {
      const input = { parentId: rootId, name: "Customers" };
      const simulated = await ensureFolderAction.dryRun?.(input, stepCtx());
      const [one, two] = await Promise.all([
        ensureFolderAction.execute(input, stepCtx()),
        ensureFolderAction.execute(input, stepCtx()),
      ]);
      expect(one.folderId).to.equal(two.folderId);
      expect(simulated?.folderId).to.equal(one.folderId);
      expect([one.created, two.created].filter(Boolean)).to.have.length(1);
      const again = await ensureFolderAction.execute(
        { parentId: rootId, name: "CUSTOMERS", visibility: "public" },
        stepCtx(),
      );
      expect(again).to.deep.include({
        folderId: one.folderId,
        created: false,
        name: "Customers",
        visibility: "private",
        folderPath: "Actions/Customers",
      });
    });

    it("creates under a binding that allows subfolders and refuses one that does not", async () => {
      const created = await ensureFolderAction.execute(
        { parentBinding: IMAGE_BINDING, name: "Post 1", visibility: "public" },
        stepCtx(),
      );
      expect(created).to.deep.include({ created: true, visibility: "public" });
      expect(
        await failureOf(
          ensureFolderAction.execute(
            { parentBinding: LOCKED_BINDING, name: "No" },
            stepCtx(),
          ),
        ),
      ).to.match(/cannot hold subfolders/);
    });
  });
}

describe("[integration] media automation — file and folder creation", function () {
  this.timeout(TEST_TIMEOUT_MS);

  before(async () => {
    addAssetBinding(IMAGE_BINDING, {
      id: IMAGE_BINDING,
      subfolders: true,
      field: { mimetypes: ["image/*"] },
    });
    addAssetBinding(LOCKED_BINDING, { id: LOCKED_BINDING });
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    rootId = await createFolder(client, "Actions");
  });

  after(() => {
    removeAssetBinding(IMAGE_BINDING);
    removeAssetBinding(LOCKED_BINDING);
  });

  describeCreateFile();
  describeCreateFileMore();
  describeCreateFileFurther();
  describeEnsureFolder();
});
