import { ActivityFeed } from "@antelopejs/interface-dms/base/activity-feed";
import { Card } from "@antelopejs/interface-dms/base/card";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { EmptyState } from "@antelopejs/interface-dms/base/empty-state";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { KeyValueList } from "@antelopejs/interface-dms/base/key-value-list";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { VStack } from "@antelopejs/interface-dms/base/stack";
import { Tab } from "@antelopejs/interface-dms/base/tab";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { libraryCategory } from "./category";
import { blockMeta } from "./texts";

const ASSET_QUERY_PARAM = "asset";
const FILE_TEXTS = "$dms_media.file";
const ASSET_API = "/api/media/assets/{{query.asset}}";
const GAP = "1rem";
const MIN_COLUMN_WIDTH = "320px";
const VIEWER_SPAN = 2;
const INFORMATION_ROWS = 4;
const DETAILS_SPACING = "1.25rem";

const TAB_SLOTS = ["details", "delivery", "history", "usage"] as const;

const panel = Tab({
  items: TAB_SLOTS.map((slot) => ({
    label: `${FILE_TEXTS}.tabs.${slot}`,
    slot,
  })),
  variant: "link",
  badgesUrl: `${ASSET_API}/tab-counts`,
})
  .meta(blockMeta("file_tabs", "i-ph-tabs"))
  .child(
    "details",
    VStack({ spacing: DETAILS_SPACING })
      .meta(blockMeta("file_details", "i-ph-list-bullets"))
      .child(
        "properties",
        CustomComponent("DmsMediaFileProperties").meta(
          blockMeta("file_properties", "i-ph-pencil-simple"),
        ),
      )
      .child(
        "information",
        KeyValueList({
          title: `${FILE_TEXTS}.information`,
          fetchUrl: `${ASSET_API}/information`,
          card: false,
          dense: true,
          skeletonCount: INFORMATION_ROWS,
        }).meta(blockMeta("file_information", "i-ph-info")),
      ),
    { slot: "details" },
  )
  .child(
    "delivery",
    CustomComponent("DmsMediaFileDelivery").meta(
      blockMeta("file_delivery", "i-ph-link"),
    ),
    { slot: "delivery" },
  )
  .child(
    "history",
    ActivityFeed({
      fetchUrl: `${ASSET_API}/history`,
      card: false,
      groupByDay: true,
      empty: { title: `${FILE_TEXTS}.no_history` },
    }).meta(blockMeta("file_history", "i-ph-clock-counter-clockwise")),
    { slot: "history" },
  )
  .child(
    "usage",
    EmptyState({
      icon: "i-ph-graph",
      title: `${FILE_TEXTS}.usage_title`,
      description: `${FILE_TEXTS}.usage_description`,
      size: "sm",
    }).meta(blockMeta("file_usage", "i-ph-graph")),
    { slot: "usage" },
  );

@RegisterPage()
export class MediaFilePage extends PageController(
  "file",
  {
    displayName: "$dms_media.file.title",
    description: "$dms_media.file.description",
    category: libraryCategory,
    icon: "i-ph-file-image",
    hidden: true,
    order: 3,
    validation: { requiredQueryParams: [ASSET_QUERY_PARAM] },
  },
  DefaultLayout({ hideHeader: true }),
) {
  static header = CustomComponent("DmsMediaFileHeader").meta(
    blockMeta("file_header", "i-ph-file-image"),
  );

  static content = Grid({ gap: GAP, minColumnWidth: MIN_COLUMN_WIDTH })
    .meta(blockMeta("file_content", "i-ph-layout"))
    .child(
      "row",
      GridRow()
        .meta(blockMeta("file_content", "i-ph-rows"))
        .child(
          "viewer",
          CustomComponent("DmsMediaFilePreview").meta(
            blockMeta("file_preview", "i-ph-image"),
          ),
          { colSpan: VIEWER_SPAN },
        )
        .child(
          "panel",
          Card()
            .meta(blockMeta("file_panel", "i-ph-sidebar-simple"))
            .child("tabs", panel),
        ),
    );
}

@RegisterPage()
export class MediaEditorPage extends PageController(
  "editor",
  {
    displayName: "$dms_media.editor.title",
    description: "$dms_media.editor.description",
    category: libraryCategory,
    icon: "i-ph-crop",
    hidden: true,
    order: 4,
    validation: { requiredQueryParams: [ASSET_QUERY_PARAM] },
  },
  DefaultLayout({ hideHeader: true }),
) {
  static editor = CustomComponent("DmsMediaImageEditor").meta(
    blockMeta("image_editor", "i-ph-crop"),
  );
}
