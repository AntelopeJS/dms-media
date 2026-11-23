import { GetModel } from "@antelopejs/interface-database-decorators";
import { internal } from "@antelopejs/interface-dms-automation";
import { expect } from "chai";
import {
  MEDIA_ACTIONS,
  MEDIA_DATA_NODES,
  MEDIA_TRIGGERS,
  registerAutomationNodes,
  unregisterAutomationNodes,
} from "../../automation";
import { quotaAlertId } from "../../automation/quota-alerts";
import { storageThresholdTrigger } from "../../automation/triggers/storage-threshold";
import { MediaQuotaAlertModel } from "../../db";
import {
  capture,
  declaredFolder,
  declaredText,
  newTenant,
} from "../helpers/automation";
import { withMediaConfig } from "../helpers/media-config";

const TEST_TIMEOUT_MS = 30_000;
const PLAN_BYTES = 1000;

/**
 * The node ids the automation interface holds, as a provider attached to it
 * sees them. The test stack has no automation module: while attached, this
 * watcher is the provider the module registers with.
 */
function watchRegistrations() {
  const registered = new Set<string>();
  const proxies = [
    internal.RegisterTriggerType,
    internal.RegisterActionType,
    internal.RegisterDataNodeType,
  ] as const;
  const leases = proxies.map((proxy) =>
    proxy.onHandlers(
      (id: string) => {
        registered.add(id);
      },
      (id: string) => {
        registered.delete(id);
      },
    ),
  );
  return {
    registered,
    detach: () =>
      proxies.forEach((proxy, index) => proxy.detach(leases[index])),
  };
}

const mediaIds = (ids: Set<string>) =>
  [...ids].filter((id) => id.startsWith("media.")).sort();

describe("[integration] media automation — registration", function () {
  this.timeout(TEST_TIMEOUT_MS);

  it("registers the 23 media node ids while started and withdraws every one on stop", async () => {
    const expected = [...MEDIA_TRIGGERS, ...MEDIA_ACTIONS, ...MEDIA_DATA_NODES]
      .map((node) => node.id)
      .sort();
    const watch = watchRegistrations();
    try {
      expect(mediaIds(watch.registered)).to.deep.equal(expected);
      await unregisterAutomationNodes();
      expect(mediaIds(watch.registered)).to.deep.equal([]);
      await registerAutomationNodes();
      expect(mediaIds(watch.registered)).to.deep.equal(expected);
    } finally {
      watch.detach();
    }
  });

  it("keeps the crossed thresholds through a stop, so a restart does not fire them again", async () => {
    const tenantId = await newTenant();
    await declaredFolder(tenantId, "restart");
    const watch = watchRegistrations();
    try {
      await withMediaConfig({ storageQuotaBytes: PLAN_BYTES }, async () => {
        const before = await capture(storageThresholdTrigger, {
          tenantId,
          percent: 50,
        });
        await declaredText(tenantId, "restart", "big.txt", 600);
        expect(before.received).to.have.length(1);
        await unregisterAutomationNodes();
        await registerAutomationNodes();
        expect(
          await GetModel(MediaQuotaAlertModel, tenantId).get(
            quotaAlertId(tenantId, 50),
          ),
        ).to.not.equal(undefined);
        const after = await capture(storageThresholdTrigger, {
          tenantId,
          percent: 50,
        });
        try {
          await declaredText(tenantId, "restart", "more.txt", 10);
          expect(after.received).to.deep.equal([]);
        } finally {
          await after.stop();
        }
      });
    } finally {
      watch.detach();
    }
  });
});
