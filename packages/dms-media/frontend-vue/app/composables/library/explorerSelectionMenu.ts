import type { DropdownMenuItem } from "@nuxt/ui";
import type { MediaAsset } from "../../types/media";
import { afterMenu, type MenuCommands } from "./explorerMenuCommands";
import type { MediaLibrary } from "./useMediaLibrary";

/** The menu of several files: every entry acts on the whole selection, and says how many files. */
export function selectionMenu(
  library: MediaLibrary,
  commands: MenuCommands,
  assets: MediaAsset[],
): DropdownMenuItem[][] {
  const { t } = library;
  const count = assets.length;
  const isEveryStarred = assets.every((asset) => asset.starred);
  const groups: DropdownMenuItem[][] = [
    [
      {
        label: t("dms_media.actions.download_zip_count", { count }, count),
        icon: "i-ph-file-zip",
        onSelect: () => void library.actions.downloadZip(assets),
      },
      {
        label: t(
          isEveryStarred
            ? "dms_media.actions.unstar_count"
            : "dms_media.actions.star_count",
          { count },
          count,
        ),
        icon: isEveryStarred ? "i-ph-star-fill" : "i-ph-star",
        onSelect: () => void library.actions.starAssets(assets),
      },
    ],
  ];
  if (library.mode !== "browse" || !assets.every(commands.canWriteAsset))
    return groups;
  return [
    ...groups,
    [
      {
        label: t("dms_media.actions.move_count", { count }, count),
        icon: "i-ph-arrows-out-cardinal",
        kbds: ["m"],
        onSelect: afterMenu(() => commands.moveAssets(assets)),
      },
      ...(assets.every(commands.canChangeVisibility)
        ? [
            {
              label: t("dms_media.actions.visibility_count", { count }, count),
              icon: "i-ph-globe",
              onSelect: afterMenu(() => commands.changeVisibility(assets)),
            },
          ]
        : []),
    ],
    [
      {
        label: t("dms_media.actions.delete_count", { count }, count),
        icon: "i-ph-trash",
        color: "error",
        kbds: ["delete"],
        onSelect: afterMenu(() => commands.deleteAssets(assets)),
      },
    ],
  ];
}
