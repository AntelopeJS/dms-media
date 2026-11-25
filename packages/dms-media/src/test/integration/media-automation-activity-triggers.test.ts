import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { createFileAction } from "../../automation/actions/create-file";
import { deleteFileAction } from "../../automation/actions/delete-file";
import { setFileVisibilityAction } from "../../automation/actions/file-visibility";
import { quotaAlertId } from "../../automation/quota-alerts";
import { libraryEventTrigger } from "../../automation/triggers/library-event";
import { storageThresholdTrigger } from "../../automation/triggers/storage-threshold";
import { MediaEventModel, MediaQuotaAlertModel } from "../../db";
import { uploadTextAsset } from "../helpers/assets";
import {
  capture,
  declaredFolder,
  declaredText,
  newTenant,
  stepCtx,
} from "../helpers/automation";
import { authorizedClient } from "../helpers/http";
import { createFolder, postOk } from "../helpers/media-api";
import { withMediaConfig } from "../helpers/media-config";
import { ensureOwnerSession } from "../helpers/owner";

const TEST_TIMEOUT_MS = 30_000;
const PLAN_BYTES = 1000;

let client: AxiosInstance;
let rootId: string;

function describeLibraryEvent(): void {
  describe("media.library-event", () => {
    it("fires for each entry with its stored id, and rewrites the visibility key to its value", async () => {
      const file = await uploadTextAsset(client, rootId, "entry.txt");
      const watching = await capture(libraryEventTrigger, {
        kinds: ["asset.rename", "folder.visibility"],
      });
      try {
        await postOk(client, `/assets/${file.id}/update`, {
          name: "renamed.txt",
        });
        await postOk(client, `/folders/${rootId}/visibility`, {
          visibility: "public",
        });
        expect(watching.received.map((payload) => payload.kind)).to.deep.equal([
          "asset.rename",
          "folder.visibility",
        ]);
        const [rename, visibility] = watching.received;
        expect(rename).to.deep.include({
          assetId: file.id,
          targetName: "renamed.txt",
          folderId: rootId,
          actorKind: "member",
        });
        expect(rename?.details).to.deep.equal({ previous: "entry.txt" });
        const stored = await GetModel(MediaEventModel, DEFAULT_TENANT_ID).get(
          rename?.eventId ?? "",
        );
        expect(stored?.kind).to.equal("asset.rename");
        expect(rename?.deliveryId).to.equal(
          `media.library-event:${DEFAULT_TENANT_ID}:${rename?.eventId}`,
        );
        expect(visibility).to.deep.include({
          targetFolderId: rootId,
          details: { visibility: "public" },
        });
      } finally {
        await watching.stop();
        await postOk(client, `/folders/${rootId}/visibility`, {
          visibility: "private",
        });
      }
    });

    it("leaves declared content out unless chosen, and records a procedure's write with its step", async () => {
      const folderKey = "activity-declared";
      await declaredFolder(DEFAULT_TENANT_ID, folderKey);
      const members = await capture(libraryEventTrigger, {});
      const declared = await capture(libraryEventTrigger, {
        actors: ["declared"],
      });
      const withWrites = await capture(libraryEventTrigger, {
        includeAutomationWrites: true,
        actors: ["declared"],
      });
      try {
        await declaredText(DEFAULT_TENANT_ID, folderKey, "declared.txt");
        const ctx = stepCtx("procedure-activity");
        await createFileAction.execute(
          {
            folderId: rootId,
            name: "made.txt",
            content: "made",
            mimetype: "text/plain",
          },
          ctx,
        );
        expect(members.received).to.deep.equal([]);
        expect(
          declared.received.map((payload) => payload.actorKind),
        ).to.deep.equal(["declared"]);
        expect(
          withWrites.received.map((payload) => payload.actorKind),
        ).to.deep.equal(["declared", "automation"]);
        expect(withWrites.received[1]?.details).to.deep.include({
          procedureId: "procedure-activity",
          runId: ctx.runId,
        });
      } finally {
        await Promise.all([members.stop(), declared.stop(), withWrites.stop()]);
      }
    });
  });
}

function describeLibraryEventMore(): void {
  describe("media.library-event", () => {
    it("drops a procedure's sixth change of one file within a minute, as a loop breaker", async () => {
      const file = await uploadTextAsset(client, rootId, "looping.txt");
      const watching = await capture(libraryEventTrigger, {
        includeAutomationWrites: true,
        kinds: ["asset.visibility"],
      });
      try {
        const ctx = stepCtx("procedure-loop");
        for (const visibility of [
          "public",
          "private",
          "public",
          "private",
          "public",
          "private",
          "public",
        ] as const)
          await setFileVisibilityAction.execute(
            { assetId: file.id, visibility },
            ctx,
          );
        expect(watching.received).to.have.length(5);
        await postOk(client, `/assets/${file.id}/visibility`, {
          visibility: "inherit",
        });
        expect(
          watching.received,
          "a member's change is not counted",
        ).to.have.length(6);
      } finally {
        await watching.stop();
      }
    });
  });
}

async function crossingTenant(folderKey: string): Promise<string> {
  const tenantId = await newTenant();
  await declaredFolder(tenantId, folderKey);
  return tenantId;
}

function describeStorageThreshold(): void {
  describe("media.storage-threshold", () => {
    it("fires once per crossing, then again only after usage drops 5 points below", async () => {
      const tenantId = await crossingTenant("quota");
      await withMediaConfig({ storageQuotaBytes: PLAN_BYTES }, async () => {
        const watching = await capture(storageThresholdTrigger, {
          tenantId,
          percent: 50,
        });
        try {
          await declaredText(tenantId, "quota", "a.txt", 400);
          expect(watching.received).to.deep.equal([]);
          const crossing = await declaredText(tenantId, "quota", "b.txt", 200);
          await declaredText(tenantId, "quota", "c.txt", 50);
          expect(watching.received).to.have.length(1);
          expect(watching.received[0]).to.deep.include({
            tenantId,
            percent: 50,
            thresholdBytes: 500,
            usedBytes: 600,
            quotaBytes: PLAN_BYTES,
            usedPercent: 60,
            triggeringKind: "asset.upload",
            actorKind: "declared",
          });
          await deleteFileAction.execute(
            { tenantId, assetId: crossing },
            stepCtx(),
          );
          await declaredText(tenantId, "quota", "d.txt", 10);
          expect(
            watching.received,
            "450 bytes is not 5 points below: no second fire",
          ).to.have.length(1);
          expect(
            await GetModel(MediaQuotaAlertModel, tenantId).get(
              quotaAlertId(tenantId, 50),
            ),
          ).to.not.equal(undefined);
        } finally {
          await watching.stop();
        }
      });
    });

    it("re-arms below the margin and fires again on the next crossing", async () => {
      const tenantId = await crossingTenant("rearm");
      await withMediaConfig({ storageQuotaBytes: PLAN_BYTES }, async () => {
        const watching = await capture(storageThresholdTrigger, {
          tenantId,
          percent: 50,
        });
        try {
          const big = await declaredText(tenantId, "rearm", "big.txt", 600);
          await deleteFileAction.execute({ tenantId, assetId: big }, stepCtx());
          await declaredText(tenantId, "rearm", "again.txt", 600);
          expect(
            watching.received.map((payload) => payload.usedBytes),
          ).to.deep.equal([600, 600]);
          expect(watching.received[0]?.deliveryId).to.not.equal(
            watching.received[1]?.deliveryId,
          );
        } finally {
          await watching.stop();
        }
      });
    });

    it("hands one crossing to every subscription of its threshold, each threshold separately", async () => {
      const tenantId = await crossingTenant("thresholds");
      await withMediaConfig({ storageQuotaBytes: PLAN_BYTES }, async () => {
        const first = await capture(storageThresholdTrigger, { percent: 50 });
        const second = await capture(storageThresholdTrigger, { percent: 50 });
        const higher = await capture(storageThresholdTrigger, { percent: 80 });
        try {
          await declaredText(tenantId, "thresholds", "all.txt", 900);
          const mine = (payloads: { tenantId: string; percent: number }[]) =>
            payloads.filter((payload) => payload.tenantId === tenantId);
          expect(
            mine(first.received).map((payload) => payload.percent),
          ).to.deep.equal([50]);
          expect(
            mine(second.received).map((payload) => payload.percent),
          ).to.deep.equal([50]);
          expect(
            mine(higher.received).map((payload) => payload.percent),
          ).to.deep.equal([80]);
        } finally {
          await Promise.all([first.stop(), second.stop(), higher.stop()]);
        }
      });
    });
  });
}

function describeStorageThresholdMore(): void {
  describe("media.storage-threshold", () => {
    it("fires for each tenant crossing the same threshold: alert rows of two tenants do not collide", async () => {
      const tenantA = await crossingTenant("tenant-a");
      const tenantB = await crossingTenant("tenant-b");
      await withMediaConfig({ storageQuotaBytes: PLAN_BYTES }, async () => {
        const watching = await capture(storageThresholdTrigger, {
          percent: 70,
        });
        try {
          await declaredText(tenantA, "tenant-a", "a.txt", 800);
          await declaredText(tenantB, "tenant-b", "b.txt", 800);
          expect(
            watching.received
              .map((payload) => payload.tenantId)
              .filter((id) => id === tenantA || id === tenantB),
          ).to.deep.equal([tenantA, tenantB]);
          expect(quotaAlertId(tenantA, 70)).to.not.equal(
            quotaAlertId(tenantB, 70),
          );
        } finally {
          await watching.stop();
        }
      });
    });

    it("fires once when two writes cross together", async () => {
      const tenantId = await crossingTenant("race");
      await withMediaConfig({ storageQuotaBytes: PLAN_BYTES }, async () => {
        const watching = await capture(storageThresholdTrigger, {
          tenantId,
          percent: 50,
        });
        try {
          await Promise.all([
            declaredText(tenantId, "race", "one.txt", 300),
            declaredText(tenantId, "race", "two.txt", 300),
          ]);
          expect(watching.received).to.have.length(1);
        } finally {
          await watching.stop();
        }
      });
    });

    it("fires once for a procedure's crossing, with its origin, and never without a plan", async () => {
      const tenantId = await crossingTenant("procedure");
      const ignoring = await capture(storageThresholdTrigger, {
        tenantId,
        percent: 10,
      });
      try {
        await declaredText(tenantId, "procedure", "unplanned.txt", 900);
        expect(ignoring.received, "no storage plan").to.deep.equal([]);
      } finally {
        await ignoring.stop();
      }
      const otherTenant = await crossingTenant("procedure-b");
      const otherFolder = await declaredFolder(otherTenant, "procedure-b");
      await withMediaConfig({ storageQuotaBytes: PLAN_BYTES }, async () => {
        const watching = await capture(storageThresholdTrigger, {
          tenantId: otherTenant,
          percent: 50,
        });
        const create = (name: string) =>
          createFileAction.execute(
            {
              tenantId: otherTenant,
              folderId: otherFolder,
              name,
              content: "x".repeat(300),
              mimetype: "text/plain",
            },
            stepCtx("procedure-quota"),
          );
        try {
          await create("first.txt");
          await create("crossing.txt");
          await create("above.txt");
          expect(watching.received).to.have.length(1);
          expect(watching.received[0]).to.deep.include({
            usedBytes: 600,
            actorKind: "automation",
            originProcedureId: "procedure-quota",
          });
        } finally {
          await watching.stop();
        }
      });
    });
  });
}

describe("[integration] media automation — activity and storage triggers", function () {
  this.timeout(TEST_TIMEOUT_MS);

  before(async () => {
    client = authorizedClient((await ensureOwnerSession()).accessToken);
    rootId = await createFolder(client, "Activity");
  });

  describeLibraryEvent();
  describeLibraryEventMore();
  describeStorageThreshold();
  describeStorageThresholdMore();
});
