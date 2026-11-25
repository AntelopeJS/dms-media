import { expect } from "chai";
import { TriggerChannel } from "../../../automation/channel";
import { runAsAutomation } from "../../../automation/origin";
import { rearmPercent } from "../../../automation/quota-alerts";
import {
  configureMediaModule,
  DEFAULT_READ_URL_MAX_TTL_SECONDS,
  getMediaConfig,
} from "../../../config";

type Payload = { tenantId: string };

const PROCEDURE = { procedureId: "procedure-guard", runId: "run-guard" };

describe("[unit] media automation channel and limits", () => {
  after(() => {
    configureMediaModule({});
  });

  it("counts a procedure's change toward the loop guard only when a subscription takes it", async () => {
    const channel = new TriggerChannel<
      { includeAutomationWrites?: boolean },
      Payload
    >("test.guard");
    const ignoring = channel.subscribe({}, () => undefined);
    for (let index = 0; index < 6; index++)
      await runAsAutomation(PROCEDURE, async () => {
        channel.emit("subject", { payload: { tenantId: "t" } });
      });
    channel.unsubscribe(ignoring);
    const received: Payload[] = [];
    const taking = channel.subscribe(
      { includeAutomationWrites: true },
      (payload) => {
        received.push(payload);
      },
    );
    await runAsAutomation(PROCEDURE, async () => {
      channel.emit("subject", { payload: { tenantId: "t" } });
    });
    channel.unsubscribe(taking);
    expect(received).to.have.length(1);
  });

  it("re-arms a threshold 5 points below it, or at half of it for 5 % or less", () => {
    expect([90, 6, 5, 1].map(rearmPercent)).to.deep.equal([85, 1, 2.5, 0.5]);
  });

  it("keeps a signed-link ceiling between 60 seconds and 7 days, the default otherwise", () => {
    const ceiling = (readUrlMaxTtlSeconds: number) => {
      configureMediaModule({ automation: { readUrlMaxTtlSeconds } });
      return getMediaConfig().readUrlMaxTtlSeconds;
    };
    expect(ceiling(120)).to.equal(120);
    expect(ceiling(30)).to.equal(DEFAULT_READ_URL_MAX_TTL_SECONDS);
    expect(ceiling(Number.NaN)).to.equal(DEFAULT_READ_URL_MAX_TTL_SECONDS);
    expect(ceiling(DEFAULT_READ_URL_MAX_TTL_SECONDS * 2)).to.equal(
      DEFAULT_READ_URL_MAX_TTL_SECONDS,
    );
  });
});
