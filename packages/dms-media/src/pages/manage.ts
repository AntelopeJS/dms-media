import { Card } from "@antelopejs/interface-dms/base/card";
import { CodeBlock } from "@antelopejs/interface-dms/base/code-block";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { KeyValueList } from "@antelopejs/interface-dms/base/key-value-list";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { manageCategory, MEDIA_MODULE_ID } from "./module";
import { blockMeta } from "./texts";

const PRESETS_TEXTS = "$dms_media.presets";
const GAP = "1rem";
const MIN_COLUMN_WIDTH = "320px";

@RegisterPage()
export class MediaPresetsPage extends PageController("presets", {
  displayName: `${PRESETS_TEXTS}.title`,
  description: `${PRESETS_TEXTS}.description`,
  category: manageCategory,
  module: MEDIA_MODULE_ID,
  icon: "i-ph-frame-corners",
  order: 0,
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
