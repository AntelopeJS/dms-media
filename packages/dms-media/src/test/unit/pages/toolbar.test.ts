import { expect } from "chai";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  ComponentBuilder,
  type ComponentInfoSerialized,
} from "@antelopejs/interface-dms/component";
import { PageMetadata } from "@antelopejs/interface-dms/page";
import { MEDIA_LIBRARY_TOPIC } from "../../../constants";
import { isObject } from "../../../guards";
import { MediaActivityPage } from "../../../pages/activity";
import { MediaOverviewPage } from "../../../pages/overview";
import { mediaPageToolbar } from "../../../pages/toolbar";
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
  return Object.values(page).filter(
    (value): value is ComponentBuilder<unknown> =>
      value instanceof ComponentBuilder,
  );
}

/** What a block reads, as its serialized options say. */
interface BlockReads {
  componentName: string;
  fetchUrl?: unknown;
  realtimeTopic?: unknown;
}

/**
 * The blocks under `block` that read data, `block` included: a `fetchUrl`, or
 * a table, which reads through a route of its own and only says its topic.
 */
function fetchingBlocks(block: ComponentInfoSerialized): BlockReads[] {
  const { options } = block;
  const own =
    isObject(options) && ("fetchUrl" in options || "realtimeTopic" in options)
      ? [
          {
            componentName: block.componentName,
            fetchUrl: "fetchUrl" in options ? options.fetchUrl : undefined,
            realtimeTopic:
              "realtimeTopic" in options ? options.realtimeTopic : undefined,
          },
        ]
      : [];
  return [
    ...own,
    ...(block.children ?? []).flatMap((child) =>
      fetchingBlocks(child.component),
    ),
  ];
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
    const lives = Object.values(LIVE_PAGES).map(
      (page) => GetMetadata(page, PageMetadata).pageInfo?.live,
    );
    const rememberKeys = new Set(lives.map((live) => live?.rememberKey));
    const [rememberKey] = rememberKeys;
    expect([...rememberKeys]).to.have.length(1);
    expect(rememberKey).to.be.a("string");
    expect(rememberKey).to.not.equal("");
    for (const live of lives) {
      expect(live?.maxRate).to.be.greaterThan(0);
    }
  });

  for (const [name, page] of Object.entries(LIVE_PAGES)) {
    it(`puts the toolbar first on the ${name} page`, () => {
      const [first] = pageBlocks(page);
      expect(first?.serializeSync().componentName).to.equal(TOOLBAR_COMPONENT);
    });
  }

  for (const [name, page] of Object.entries(LIVE_PAGES)) {
    it(`reads every block of the ${name} page again on library changes`, () => {
      const blocks = pageBlocks(page).flatMap((block) =>
        fetchingBlocks(block.serializeSync()),
      );
      expect(blocks).to.have.length.greaterThan(0);
      for (const block of blocks) {
        expect(
          block.realtimeTopic,
          `${block.componentName} ${JSON.stringify(block.fetchUrl)}`,
        ).to.equal(MEDIA_LIBRARY_TOPIC);
      }
    });
  }

  it("holds the upload history while the page is paused", () => {
    expect(MediaUploadsPage.history.serializeSync().options).to.include({
      liveHold: true,
    });
  });
});
