import { ActivityFeed } from "@antelopejs/interface-dms/base/activity-feed";
import { Card } from "@antelopejs/interface-dms/base/card";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { Tab } from "@antelopejs/interface-dms/base/tab";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { MEDIA_LIBRARY_TOPIC } from "../constants";
import { ACTIVITY_FILTERS, type ActivityFilter } from "../library/activity";
import { libraryCategory, MEDIA_MODULE_ID } from "./module";
import { blockMeta } from "./texts";
import { MEDIA_LIVE, mediaPageToolbar } from "./toolbar";

const TEXTS = "$dms_media.activity_page";
const FEED_LENGTH = 50;
const SKELETON_ROWS = 8;
const ALL_SLOT = "all";

const FILTERS = Object.keys(ACTIVITY_FILTERS) as ActivityFilter[];

function feed(filter?: ActivityFilter) {
  const query = filter ? `&type=${filter}` : "";
  return ActivityFeed({
    fetchUrl: `/api/media/activity?limit=${FEED_LENGTH}${query}`,
    realtimeTopic: MEDIA_LIBRARY_TOPIC,
    maxItems: FEED_LENGTH,
    groupByDay: true,
    card: false,
    skeletonCount: SKELETON_ROWS,
    empty: { title: "$dms_media.overview.activity.empty" },
  }).meta(blockMeta("activity_log", "i-ph-clock-counter-clockwise"));
}

function filteredFeeds() {
  return FILTERS.reduce(
    (tabs, filter) => tabs.child(filter, feed(filter), { slot: filter }),
    Tab({
      items: [ALL_SLOT, ...FILTERS].map((slot) => ({
        label: `${TEXTS}.filters.${slot}`,
        slot,
      })),
      variant: "pill",
      fit: true,
      unmountOnHide: true,
    })
      .meta(blockMeta("activity_filters", "i-ph-funnel"))
      .child(ALL_SLOT, feed(), { slot: ALL_SLOT }),
  );
}

/** Everything that happened in the library lately, reached from the overview's feed. */
@RegisterPage()
export class MediaActivityPage extends PageController(
  "activity",
  {
    displayName: `${TEXTS}.title`,
    description: `${TEXTS}.description`,
    category: libraryCategory,
    module: MEDIA_MODULE_ID,
    icon: "i-ph-clock-counter-clockwise",
    hidden: true,
    order: 5,
    live: MEDIA_LIVE,
  },
  DefaultLayout(),
) {
  static toolbar = mediaPageToolbar();

  static feed = Card()
    .meta(blockMeta("activity_log", "i-ph-clock-counter-clockwise"))
    .child("filters", filteredFeeds());
}
