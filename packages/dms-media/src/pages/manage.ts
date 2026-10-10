import { Banner } from "@antelopejs/interface-dms/base/banner";
import { Card } from "@antelopejs/interface-dms/base/card";
import { CodeBlock } from "@antelopejs/interface-dms/base/code-block";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { KeyValueList } from "@antelopejs/interface-dms/base/key-value-list";
import { VStack } from "@antelopejs/interface-dms/base/stack";
import { StatGroup } from "@antelopejs/interface-dms/base/stat-group";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { DefaultDisplays } from "@antelopejs/interface-dms/base/table-view/column-display";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { manageCategory } from "./category";
import { blockMeta } from "./texts";
import { MEDIA_LIBRARY_TOPIC } from "../constants";

const ACCESS_TEXTS = "$dms_media.access";
const LINKED_TEXTS = "$dms_media.linked";
const PRESETS_TEXTS = "$dms_media.presets";
const GAP = "1rem";
const MIN_COLUMN_WIDTH = "320px";
const ACCESS_TREE_WIDTH = "280px";
const ACCESS_DETAIL_SPAN = 2;
const ACCESS_RIGHTS_COUNT = 3;

const accessFolder = VStack({ spacing: GAP, alignment: "stretch" })
  .meta(blockMeta("access_folder", "i-ph-folder-simple"))
  .child(
    "summary",
    CustomComponent("DmsMediaAccessFolder").meta(
      blockMeta("access_summary", "i-ph-folder-simple"),
    ),
  )
  .child(
    "rights",
    StatGroup({
      layout: "cards",
      columns: ACCESS_RIGHTS_COUNT,
      fetchUrl: "/api/media/folders/{{query.folder}}/access/stats",
      realtimeTopic: MEDIA_LIBRARY_TOPIC,
      skeletonCount: ACCESS_RIGHTS_COUNT,
      label: `${ACCESS_TEXTS}.rights_label`,
    }).meta(blockMeta("access_rights", "i-ph-users-three")),
  )
  .child(
    "rules",
    CustomComponent("DmsMediaAccessRulesCard").meta(
      blockMeta("access_rules", "i-ph-list-checks"),
    ),
  )
  .child(
    "visibility",
    CustomComponent("DmsMediaAccessVisibility").meta(
      blockMeta("access_visibility", "i-ph-globe"),
    ),
  );

@RegisterPage()
export class MediaAccessPage extends PageController("access", {
  displayName: `${ACCESS_TEXTS}.title`,
  description: `${ACCESS_TEXTS}.description`,
  category: manageCategory,
  icon: "i-ph-shield-check",
  order: 0,
  noComponentPermissions: true,
}) {
  static editor = Grid({ gap: GAP, minColumnWidth: ACCESS_TREE_WIDTH })
    .meta(blockMeta("access_editor", "i-ph-shield-check"))
    .child(
      "row",
      GridRow()
        .meta(blockMeta("access_editor", "i-ph-rows"))
        .child(
          "tree",
          CustomComponent("DmsMediaAccessTree").meta(
            blockMeta("access_tree", "i-ph-tree-structure"),
          ),
        )
        .child("folder", accessFolder, { colSpan: ACCESS_DETAIL_SPAN }),
    );
}

const stringColumn = (name: string, order: number) => ({
  name: `${LINKED_TEXTS}.columns.${name}`,
  type: new DefaultDataTypes.StringType(),
  order,
});

const linkedFolders = TableView.fromSource({
  caption: `${LINKED_TEXTS}.table`,
  fetchUrl: "/api/media/linked",
  realtimeTopic: MEDIA_LIBRARY_TOPIC,
  layout: "compact",
  emptyStates: {
    firstRun: {
      title: `${LINKED_TEXTS}.empty`,
      description: `${LINKED_TEXTS}.empty_description`,
      icon: "i-ph-link-simple",
    },
  },
  expandable: {
    component: CustomComponent("DmsMediaLinkedDetail").meta(
      blockMeta("linked_detail", "i-ph-link-simple"),
    ),
    single: true,
  },
  columns: {
    folder: {
      ...stringColumn("folder", 1),
      sortable: true,
      display: new DefaultDisplays.TwoLineDisplay({ subField: "path" }),
    },
    field: {
      ...stringColumn("field", 3),
      display: new DefaultDisplays.MonoDisplay({}),
    },
    accepts: stringColumn("accepts", 4),
    uploaders: {
      ...stringColumn("uploaders", 5),
      display: new DefaultDisplays.MonoDisplay({}),
    },
    visibility: {
      name: `${LINKED_TEXTS}.columns.visibility`,
      type: new DefaultDataTypes.SelectType({
        items: [
          { value: "public", label: "$dms_media.visibility.public" },
          { value: "private", label: "$dms_media.visibility.private" },
        ],
      }),
      display: new DefaultDisplays.StatusPillDisplay({
        tones: { public: "success", private: "neutral" },
      }),
      order: 6,
    },
    files: {
      name: `${LINKED_TEXTS}.columns.files`,
      type: new DefaultDataTypes.NumberType(),
      order: 7,
      sortable: true,
    },
  },
}).meta(blockMeta("linked_folders", "i-ph-link-simple"));

@RegisterPage()
export class MediaLinkedPage extends PageController("linked", {
  displayName: `${LINKED_TEXTS}.title`,
  description: `${LINKED_TEXTS}.description`,
  category: manageCategory,
  icon: "i-ph-link-simple",
  order: 1,
}) {
  static explainer = Banner({
    tone: "info",
    size: "sm",
    title: `${LINKED_TEXTS}.banner.title`,
    description: `${LINKED_TEXTS}.banner.description`,
    dismissible: true,
    dismissKey: "dms-media-linked-explainer",
  }).meta(blockMeta("linked_explainer", "i-ph-info"));

  static folders = linkedFolders;
}

@RegisterPage()
export class MediaPresetsPage extends PageController("presets", {
  displayName: `${PRESETS_TEXTS}.title`,
  description: `${PRESETS_TEXTS}.description`,
  category: manageCategory,
  icon: "i-ph-frame-corners",
  order: 2,
}) {
  static cards = CustomComponent("DmsMediaPresetCards").meta(
    blockMeta("preset_cards", "i-ph-frame-corners"),
  );

  static details = Grid({ gap: GAP, minColumnWidth: MIN_COLUMN_WIDTH })
    .meta(blockMeta("preset_details", "i-ph-layout"))
    .child(
      "row",
      GridRow()
        .meta(blockMeta("preset_details", "i-ph-rows"))
        .child(
          "cache",
          KeyValueList({
            title: `${PRESETS_TEXTS}.cache.title`,
            fetchUrl: "/api/media/presets/cache",
            skeletonCount: 3,
          }).meta(blockMeta("preset_cache", "i-ph-broom")),
        )
        .child(
          "config",
          Card({
            title: `${PRESETS_TEXTS}.config.title`,
            footer: `${PRESETS_TEXTS}.config.hint`,
          })
            .meta(blockMeta("preset_config", "i-ph-code"))
            .child(
              "code",
              CodeBlock({
                title: "antelope.config.ts",
                language: "typescript",
                fetchUrl: "/api/media/presets/config",
              }).meta(blockMeta("preset_config_code", "i-ph-code")),
            ),
        ),
    );
}
