import { randomUUID } from "node:crypto";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { ImportMediaAsset } from "@antelopejs/interface-dms-media";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { createFileAction } from "../../automation/actions/create-file";
import { deleteFileAction } from "../../automation/actions/delete-file";
import { fileDeletedTrigger } from "../../automation/triggers/file-deleted";
import { filePublishedTrigger } from "../../automation/triggers/file-published";
import { fileUploadedTrigger } from "../../automation/triggers/file-uploaded";
import { uploadStorageBytes } from "../../derivatives";
import { DECLARED_CONTENT_AUTHOR } from "../../declared/records";
import { resolveSystemContext } from "../../services/context";
import {
  applyFolderDeletion,
  planFolderDeletion,
} from "../../services/folders";
import { uploadAsset, uploadTextAsset } from "../helpers/assets";
import {
  capture,
  declaredFolder,
  newTenant,
  stepCtx,
} from "../helpers/automation";
import { authorizedClient } from "../helpers/http";
import { createFolder, deleteOk, postOk } from "../helpers/media-api";
import { ensureOwnerSession } from "../helpers/owner";
import { solidPng } from "../helpers/png";

const TEST_TIMEOUT_MS = 30_000;

let client: AxiosInstance;
let rootId: string;
let nestedId: string;

function createText(tenantId: string, folderId: string, name: string) {
  return createFileAction.execute(
    { tenantId, folderId, name, content: "hello", mimetype: "text/plain" },
    stepCtx("procedure-uploads"),
  );
}

function describeFileUploaded(): void {
  describe("media.file-uploaded", () => {
    it("fires once for an upload below the watched folder, with its folder path, actor and dedup key", async () => {
      const watching = await capture(fileUploadedTrigger, { folderId: rootId });
      const direct = await capture(fileUploadedTrigger, {
        folderId: rootId,
        includeSubfolders: false,
      });
      const images = await capture(fileUploadedTrigger, {
        mimetypes: ["image/*"],
      });
      try {
        const uploaded = await uploadTextAsset(client, nestedId, "notes.txt");
        expect(watching.received).to.have.length(1);
        expect(watching.received[0]).to.deep.include({
          tenantId: DEFAULT_TENANT_ID,
          deliveryId: `media.file-uploaded:${DEFAULT_TENANT_ID}:${uploaded.id}`,
          assetId: uploaded.id,
          source: "upload",
          actorKind: "member",
          folderId: nestedId,
          folderPath: "Triggers/Nested",
          effectiveVisibility: "private",
          copiedFromAssetId: null,
        });
        expect(watching.received[0]?.folderPathIds).to.deep.equal([
          rootId,
          nestedId,
        ]);
        expect(watching.received[0]?.originProcedureId).to.equal(undefined);
        expect(direct.received, "includeSubfolders: false").to.deep.equal([]);
        expect(images.received, "mimetype filter").to.deep.equal([]);
      } finally {
        await Promise.all([watching.stop(), direct.stop(), images.stop()]);
      }
    });

    it("reports an edited copy as `copy` with its source", async () => {
      const source = await uploadAsset(
        client,
        rootId,
        "wide.png",
        "image/png",
        await solidPng(20, 10),
      );
      const watching = await capture(fileUploadedTrigger, { folderId: rootId });
      try {
        await postOk(client, `/assets/${source.id}/transform/copy`, {
          rotate: 90,
        });
        expect(watching.received).to.have.length(1);
        expect(watching.received[0]).to.deep.include({
          source: "copy",
          copiedFromAssetId: source.id,
          width: 10,
          height: 20,
        });
      } finally {
        await watching.stop();
      }
    });

    it("fires for declared files only when `declared` is chosen, and not for a kept one", async () => {
      const folderKey = `triggers-declared-${randomUUID()}`;
      await declaredFolder(DEFAULT_TENANT_ID, folderKey);
      const byDefault = await capture(fileUploadedTrigger, {});
      const declared = await capture(fileUploadedTrigger, {
        sources: ["declared"],
      });
      const declaration = {
        tenantId: DEFAULT_TENANT_ID,
        key: `${folderKey}/a`,
        folder: { key: folderKey },
        name: "a.txt",
        mimetype: "text/plain",
        source: { bytes: Buffer.from("declared") },
      };
      try {
        await ImportMediaAsset(declaration);
        await ImportMediaAsset(declaration);
        expect(byDefault.received).to.deep.equal([]);
        expect(declared.received).to.have.length(1);
        expect(declared.received[0]).to.deep.include({
          source: "declared",
          actorKind: "declared",
          actorId: DECLARED_CONTENT_AUTHOR._id,
          actorName: "System",
        });
      } finally {
        await Promise.all([byDefault.stop(), declared.stop()]);
      }
    });
  });
}

function describeFileUploadedMore(): void {
  describe("media.file-uploaded", () => {
    it("ignores a procedure's file unless includeAutomationWrites, which carries the procedure and run", async () => {
      const byDefault = await capture(fileUploadedTrigger, {});
      const withWrites = await capture(fileUploadedTrigger, {
        includeAutomationWrites: true,
      });
      try {
        const ctx = stepCtx("procedure-uploads");
        const created = await createFileAction.execute(
          {
            folderId: rootId,
            name: "report.csv",
            content: "a,b\n1,2\n",
            mimetype: "text/csv",
          },
          ctx,
        );
        expect(byDefault.received).to.deep.equal([]);
        expect(withWrites.received).to.have.length(1);
        expect(withWrites.received[0]).to.deep.include({
          assetId: created.assetId,
          source: "automation",
          actorKind: "automation",
          actorName: "Automation",
          originProcedureId: "procedure-uploads",
          originRunId: ctx.runId,
        });
      } finally {
        await Promise.all([byDefault.stop(), withWrites.stop()]);
      }
    });

    it("delivers another tenant's file only to a trigger not narrowed to the default tenant", async () => {
      const otherTenant = await newTenant();
      const folderId = await declaredFolder(otherTenant, "isolation");
      const defaultOnly = await capture(fileUploadedTrigger, {
        tenantId: DEFAULT_TENANT_ID,
        includeAutomationWrites: true,
      });
      const anyTenant = await capture(fileUploadedTrigger, {
        includeAutomationWrites: true,
      });
      try {
        await createText(otherTenant, folderId, "other.txt");
        expect(defaultOnly.received).to.deep.equal([]);
        expect(
          anyTenant.received.map((payload) => payload.tenantId),
        ).to.deep.equal([otherTenant]);
      } finally {
        await Promise.all([defaultOnly.stop(), anyTenant.stop()]);
      }
    });

    it("keeps the upload when a subscriber throws, and stops delivering once deactivated", async () => {
      const handle = await fileUploadedTrigger.activate({}, () => {
        throw new Error("subscriber failure");
      });
      const watching = await capture(fileUploadedTrigger, {});
      try {
        await uploadTextAsset(client, rootId, "survives.txt");
        expect(watching.received).to.have.length(1);
      } finally {
        await fileUploadedTrigger.deactivate(handle);
        await watching.stop();
      }
      await uploadTextAsset(client, rootId, "unheard.txt");
      expect(watching.received).to.have.length(1);
    });
  });
}

function describeFileDeleted(): void {
  describe("media.file-deleted", () => {
    it("fires for a file deleted on its own with its snapshot, and for a procedure's delete only with includeAutomationWrites", async () => {
      const first = await uploadTextAsset(client, nestedId, "gone.txt");
      const second = await uploadTextAsset(client, nestedId, "gone-too.txt");
      const watching = await capture(fileDeletedTrigger, { folderId: rootId });
      const withWrites = await capture(fileDeletedTrigger, {
        includeAutomationWrites: true,
      });
      try {
        await deleteOk(client, `/assets/${first.id}`);
        await deleteFileAction.execute({ assetId: second.id }, stepCtx());
        expect(watching.received).to.have.length(1);
        expect(watching.received[0]).to.deep.include({
          deliveryId: `media.file-deleted:${DEFAULT_TENANT_ID}:${first.id}`,
          assetId: first.id,
          name: "gone.txt",
          cause: "file",
          folderPath: "Triggers/Nested",
          deletedFolderId: null,
        });
        expect(
          withWrites.received.map((payload) => payload.assetId),
        ).to.deep.equal([first.id, second.id]);
      } finally {
        await Promise.all([watching.stop(), withWrites.stop()]);
      }
    });

    it("fires per file at every level of a deleted folder tree, a file written during the cascade included", async () => {
      const doomed = await createFolder(client, "Doomed");
      const inner = await createFolder(client, "Inner", doomed);
      const top = await uploadTextAsset(client, doomed, "top.txt");
      const deep = await uploadTextAsset(client, inner, "deep.txt");
      const folderOnly = await capture(fileDeletedTrigger, {
        causes: ["folder"],
      });
      const fileOnly = await capture(fileDeletedTrigger, { causes: ["file"] });
      try {
        const context = await resolveSystemContext(
          DEFAULT_TENANT_ID,
          DECLARED_CONTENT_AUTHOR,
        );
        const plan = await planFolderDeletion(context, doomed);
        const lateId = randomUUID();
        await context.assetModel.insert({
          _id: lateId,
          folderId: inner,
          name: "late.txt",
          mimetype: "text/plain",
          size: 4,
          storageKey: await uploadStorageBytes(
            Buffer.from("late"),
            "late.txt",
            "text/plain",
            randomUUID(),
            undefined,
          ),
          createdBy: "test",
          visibility: "inherit",
          mediaRevision: randomUUID(),
          json_retiredFiles: "[]",
        });
        await applyFolderDeletion(context, plan);
        expect(
          folderOnly.received.map((payload) => payload.assetId).sort(),
        ).to.deep.equal([top.id, deep.id, lateId].sort());
        for (const payload of folderOnly.received)
          expect(payload).to.deep.include({
            cause: "folder",
            deletedFolderId: doomed,
            deletedFolderName: "Doomed",
          });
        expect(fileOnly.received).to.deep.equal([]);
      } finally {
        await Promise.all([folderOnly.stop(), fileOnly.stop()]);
      }
    });
  });
}

function describeFilePublished(): void {
  describe("media.file-published", () => {
    it("fires when a file's own setting makes it public, not when it was public already", async () => {
      const file = await uploadTextAsset(client, rootId, "flip.txt");
      const watching = await capture(filePublishedTrigger, {});
      try {
        await postOk(client, `/assets/${file.id}/visibility`, {
          visibility: "public",
        });
        await postOk(client, `/assets/${file.id}/visibility`, {
          visibility: "public",
        });
        expect(watching.received).to.have.length(1);
        expect(watching.received[0]).to.deep.include({
          assetId: file.id,
          reason: "visibility",
          visibility: "public",
          previousEffectiveVisibility: "private",
        });
      } finally {
        await watching.stop();
      }
    });

    it("fires for the following files of a folder made public, not for one kept private, nor its subfolder's", async () => {
      const shared = await createFolder(client, "Shared");
      const sub = await createFolder(client, "Sub", shared);
      const following = await Promise.all(
        ["a.txt", "b.txt", "c.txt"].map((name) =>
          uploadTextAsset(client, shared, name),
        ),
      );
      const kept = await uploadTextAsset(client, shared, "kept.txt");
      await postOk(client, `/assets/${kept.id}/visibility`, {
        visibility: "private",
      });
      await uploadTextAsset(client, sub, "below.txt");
      const watching = await capture(filePublishedTrigger, {});
      const moves = await capture(filePublishedTrigger, { reasons: ["move"] });
      try {
        await postOk(client, `/folders/${shared}/visibility`, {
          visibility: "public",
        });
        expect(
          watching.received.map((payload) => payload.assetId).sort(),
        ).to.deep.equal(following.map((file) => file.id).sort());
        expect(
          watching.received.every((payload) => payload.reason === "folder"),
        ).to.equal(true);
        expect(moves.received).to.deep.equal([]);
        const moved = await uploadTextAsset(client, rootId, "moved.txt");
        await postOk(client, `/assets/${moved.id}/move`, { folderId: shared });
        expect(moves.received.map((payload) => payload.assetId)).to.deep.equal([
          moved.id,
        ]);
      } finally {
        await Promise.all([watching.stop(), moves.stop()]);
      }
    });
  });
}

describe("[integration] media automation — file triggers", function () {
  this.timeout(TEST_TIMEOUT_MS);

  before(async () => {
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    rootId = await createFolder(client, "Triggers");
    nestedId = await createFolder(client, "Nested", rootId);
  });

  describeFileUploaded();
  describeFileUploadedMore();
  describeFileDeleted();
  describeFilePublished();
});
