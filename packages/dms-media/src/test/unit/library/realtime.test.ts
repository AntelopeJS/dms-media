import { expect } from "chai";
import {
  type RealtimeMessage,
  SubscribeMessage,
} from "@antelopejs/interface-dms";
import { MEDIA_LIBRARY_TOPIC } from "../../../constants";
import {
  announceLibraryChange,
  cancelLibraryChange,
} from "../../../library/realtime";

const SHORT_WINDOW_MS = 20;
const SETTLE_MS = 150;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("[unit] library — realtime", () => {
  let messages: RealtimeMessage[];
  let unsubscribe: () => void;

  beforeEach(() => {
    // Changes the integration suites made may still be waiting to be announced.
    cancelLibraryChange();
    messages = [];
    unsubscribe = SubscribeMessage(MEDIA_LIBRARY_TOPIC, (message) => {
      messages.push(message);
    });
  });

  afterEach(() => {
    unsubscribe();
    cancelLibraryChange();
  });

  it("announces a burst of changes once, with how many it stands for", async () => {
    announceLibraryChange(SHORT_WINDOW_MS);
    announceLibraryChange(SHORT_WINDOW_MS);
    announceLibraryChange(SHORT_WINDOW_MS);
    await wait(SETTLE_MS);
    expect(messages).to.have.length(1);
    expect(messages[0]?.payload).to.deep.equal({ count: 3 });
  });

  it("starts counting again after an announcement", async () => {
    announceLibraryChange(SHORT_WINDOW_MS);
    await wait(SETTLE_MS);
    announceLibraryChange(SHORT_WINDOW_MS);
    await wait(SETTLE_MS);
    expect(messages.map((message) => message.payload?.count)).to.deep.equal([
      1, 1,
    ]);
  });
});
