import { ActivityFeed } from "@antelopejs/interface-dms/base/activity-feed";
import { Card } from "@antelopejs/interface-dms/base/card";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { KeyValueList } from "@antelopejs/interface-dms/base/key-value-list";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { Meter } from "@antelopejs/interface-dms/base/meter";
import { StatGroup } from "@antelopejs/interface-dms/base/stat-group";
import { ButtonVariant } from "@antelopejs/interface-dms/base/types/button";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { MEDIA_ROUTES, viewLink } from "../library/links";
import { libraryCategory, MEDIA_MODULE_ID } from "./module";
import { blockMeta } from "./texts";
import { MEDIA_LIBRARY_TOPIC } from "../constants";

const TEXTS = "$dms_media.overview";
/** Shortest interval, in seconds, between two refetches of a block while files upload. */
const LIVE_MAX_RATE_SECONDS = 2;
const GAP = "1rem";
const MIN_COLUMN_WIDTH = "320px";
const WIDE_SPAN = 2;
const FULL_SPAN = 3;
const KPI_COUNT = 4;
const ACTIVITY_LENGTH = 6;

const storage = Card({ title: `${TEXTS}.storage.title` })
  .meta(blockMeta("storage", "i-ph-chart-bar-horizontal"))
  .child(
    "byType",
    Meter({
      fetchUrl: "/api/media/stats/storage",
      realtimeTopic: MEDIA_LIBRARY_TOPIC,
      legend: true,
      size: "md",
      format: "none",
      actions: [
        {
          label: `${TEXTS}.storage.largest_files`,
          to: viewLink("largest"),
          icon: "i-ph-sort-descending",
          variant: "link",
        },
      ],
    }).meta(blockMeta("storage_types", "i-ph-chart-bar-horizontal")),
  );

const attention = KeyValueList({
  title: `${TEXTS}.attention.title`,
  fetchUrl: "/api/media/stats/attention",
  realtimeTopic: MEDIA_LIBRARY_TOPIC,
  skeletonCount: 2,
  empty: {
    title: `${TEXTS}.attention.empty`,
    description: `${TEXTS}.attention.empty_description`,
  },
}).meta(blockMeta("attention", "i-ph-warning-circle"));

const activity = ActivityFeed({
  title: `${TEXTS}.activity.title`,
  fetchUrl: `/api/media/activity?limit=${ACTIVITY_LENGTH}`,
  realtimeTopic: MEDIA_LIBRARY_TOPIC,
  maxItems: ACTIVITY_LENGTH,
  groupByDay: false,
  card: true,
  skeletonCount: ACTIVITY_LENGTH,
  empty: { title: `${TEXTS}.activity.empty` },
  actions: [
    {
      label: `${TEXTS}.activity.view_all`,
      to: MEDIA_ROUTES.activity,
      variant: "link",
    },
  ],
}).meta(blockMeta("activity", "i-ph-clock-counter-clockwise"));

@RegisterPage()
export class MediaOverviewPage extends PageController(
  "overview",
  {
    displayName: `${TEXTS}.title`,
    description: `${TEXTS}.description`,
    category: libraryCategory,
    module: MEDIA_MODULE_ID,
    icon: "i-ph-squares-four",
    order: 0,
    live: { maxRate: LIVE_MAX_RATE_SECONDS },
  },
  DefaultLayout({
    headerActions: [
      {
        id: "open-library",
        label: `${TEXTS}.open_library`,
        icon: "i-ph-folder-open",
        variant: ButtonVariant.outline,
        color: "neutral",
        target: { type: "page", url: MEDIA_ROUTES.files },
      },
    ],
  }),
) {
  static firstRun = CustomComponent("DmsMediaFirstRun").meta(
    blockMeta("first_run", "i-ph-sparkle"),
  );

  static uploadStrip = CustomComponent("DmsMediaUploadStrip").meta(
    blockMeta("upload_strip", "i-ph-cloud-arrow-up"),
  );

  static attention = attention;

  static kpis = StatGroup({
    layout: "cards",
    columns: KPI_COUNT,
    fetchUrl: "/api/media/stats/kpis",
    realtimeTopic: MEDIA_LIBRARY_TOPIC,
    skeletonCount: KPI_COUNT,
    label: `${TEXTS}.kpis.label`,
  }).meta(blockMeta("kpis", "i-ph-chart-line-up"));

  static content = Grid({ gap: GAP, minColumnWidth: MIN_COLUMN_WIDTH })
    .meta(blockMeta("content", "i-ph-layout"))
    .child(
      "health",
      GridRow()
        .meta(blockMeta("health", "i-ph-rows"))
        .child("storage", storage, { colSpan: WIDE_SPAN })
        .child("activity", activity),
    )
    .child(
      "recent",
      GridRow()
        .meta(blockMeta("recent_row", "i-ph-rows"))
        .child(
          "files",
          CustomComponent("DmsMediaRecentFiles").meta(
            blockMeta("recent", "i-ph-images"),
          ),
          { colSpan: FULL_SPAN },
        ),
    );
}
