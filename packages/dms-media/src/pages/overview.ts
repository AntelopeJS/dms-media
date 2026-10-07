import { ActivityFeed } from "@antelopejs/interface-dms/base/activity-feed";
import { Card } from "@antelopejs/interface-dms/base/card";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { KeyValueList } from "@antelopejs/interface-dms/base/key-value-list";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { Meter } from "@antelopejs/interface-dms/base/meter";
import { NavCardGrid } from "@antelopejs/interface-dms/base/nav-card-grid";
import { StatGroup } from "@antelopejs/interface-dms/base/stat-group";
import { ButtonVariant } from "@antelopejs/interface-dms/base/types/button";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { MEDIA_ROUTES } from "../library/links";
import { libraryCategory } from "./category";
import { blockMeta } from "./texts";

const TEXTS = "$dms_media.overview";
const GAP = "1rem";
const MIN_COLUMN_WIDTH = "320px";
const WIDE_SPAN = 2;
const KPI_COUNT = 4;
const FOLDER_COLUMNS = 3;
const ACTIVITY_LENGTH = 6;

const storage = Card({ title: `${TEXTS}.storage.title` })
  .meta(blockMeta("storage", "i-ph-chart-bar-horizontal"))
  .child(
    "byType",
    Meter({
      fetchUrl: "/api/media/stats/storage",
      legend: true,
      size: "md",
      format: "none",
    }).meta(blockMeta("storage_types", "i-ph-chart-bar-horizontal")),
  )
  .child(
    "largest",
    KeyValueList({
      title: `${TEXTS}.largest.title`,
      fetchUrl: "/api/media/stats/largest",
      card: false,
      dense: true,
      skeletonCount: 3,
      empty: { title: `${TEXTS}.largest.empty` },
    }).meta(blockMeta("largest_folders", "i-ph-folders")),
  );

const attention = KeyValueList({
  title: `${TEXTS}.attention.title`,
  fetchUrl: "/api/media/stats/attention",
  skeletonCount: 3,
  empty: {
    title: `${TEXTS}.attention.empty`,
    description: `${TEXTS}.attention.empty_description`,
  },
}).meta(blockMeta("attention", "i-ph-warning-circle"));

const folders = NavCardGrid({
  title: `${TEXTS}.folders.title`,
  fetchUrl: "/api/media/stats/folders",
  columns: FOLDER_COLUMNS,
  skeletonCount: FOLDER_COLUMNS,
  empty: { title: `${TEXTS}.folders.empty` },
}).meta(blockMeta("folders", "i-ph-folder-simple"));

const activity = ActivityFeed({
  title: `${TEXTS}.activity.title`,
  fetchUrl: `/api/media/activity?limit=${ACTIVITY_LENGTH}`,
  maxItems: ACTIVITY_LENGTH,
  groupByDay: false,
  card: true,
  skeletonCount: ACTIVITY_LENGTH,
  empty: { title: `${TEXTS}.activity.empty` },
}).meta(blockMeta("activity", "i-ph-clock-counter-clockwise"));

@RegisterPage()
export class MediaOverviewPage extends PageController(
  "overview",
  {
    displayName: `${TEXTS}.title`,
    description: `${TEXTS}.description`,
    category: libraryCategory,
    icon: "i-ph-squares-four",
    order: 0,
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
      {
        id: "upload",
        label: `${TEXTS}.upload`,
        icon: "i-ph-upload-simple",
        variant: ButtonVariant.solid,
        color: "primary",
        target: { type: "page", url: `${MEDIA_ROUTES.uploads}?pick=1` },
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

  static kpis = StatGroup({
    layout: "cards",
    columns: KPI_COUNT,
    fetchUrl: "/api/media/stats/kpis",
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
        .child("attention", attention),
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
          { colSpan: WIDE_SPAN + 1 },
        ),
    )
    .child(
      "browse",
      GridRow()
        .meta(blockMeta("browse", "i-ph-rows"))
        .child("folders", folders, { colSpan: WIDE_SPAN })
        .child("activity", activity),
    );
}
