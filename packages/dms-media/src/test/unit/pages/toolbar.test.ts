import { expect } from "chai";
import type { ComponentBuilder } from "@antelopejs/interface-dms/component";
import { MediaActivityPage } from "../../../pages/activity";
import { MediaOverviewPage } from "../../../pages/overview";
import { MEDIA_LIVE, mediaPageToolbar } from "../../../pages/toolbar";
import { MediaUploadsPage } from "../../../pages/uploads";

const TOOLBAR_COMPONENT = "dms-page-toolbar-block";
const LIVE_PAGES = {
  overview: MediaOverviewPage,
  activity: MediaActivityPage,
  uploads: MediaUploadsPage,
};

type LivePage = (typeof LIVE_PAGES)[keyof typeof LIVE_PAGES];

/** The blocks a page declares, in the order it renders them. */
function pageBlocks(page: LivePage): ComponentBuilder<unknown>[] {
  return Object.values(page) as ComponentBuilder<unknown>[];
}

describe("[unit] pages — toolbar", () => {
  it("shows when the page last read the library and Direct / Pause, without a period", () => {
    const serialized = mediaPageToolbar().serializeSync();
    expect(serialized.componentName).to.equal(TOOLBAR_COMPONENT);
    expect(serialized.children?.map((child) => child.id)).to.deep.equal([
      "live",
    ]);
    expect(serialized.children?.[0]?.component.options).to.include({
      missedLabel: "$dms_media.live.missed",
    });
  });

  it("shares one Direct / Pause choice between the media pages", () => {
    expect(MEDIA_LIVE.rememberKey).to.equal("media");
    expect(MEDIA_LIVE.maxRate).to.be.greaterThan(0);
  });

  for (const [name, page] of Object.entries(LIVE_PAGES)) {
    it(`puts the toolbar first on the ${name} page`, () => {
      const [first] = pageBlocks(page);
      expect(first?.serializeSync().componentName).to.equal(TOOLBAR_COMPONENT);
    });
  }

  it("holds the upload history while the page is paused", () => {
    expect(MediaUploadsPage.history.serializeSync().options).to.include({
      liveHold: true,
    });
  });
});
