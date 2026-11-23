import type { DropdownMenuItem } from "@nuxt/ui";
import type { MediaAsset } from "../../types/media";
import { afterMenu, type MenuCommands } from "./explorerMenuCommands";
import type { MediaLibrary } from "./useMediaLibrary";

function fileViewItems(
  library: MediaLibrary,
  commands: MenuCommands,
  asset: MediaAsset,
  canWrite: boolean,
): DropdownMenuItem[] {
  const { t } = library;
  const isBrowse = library.mode === "browse";
  return [
    {
      label: t("dms_media.actions.preview"),
      icon: "i-ph-arrows-out-simple",
      kbds: ["space"],
      onSelect: afterMenu(() => commands.preview(asset)),
    },
    ...(isBrowse
      ? [
          {
            label: t("dms_media.actions.open_details"),
            icon: "i-ph-arrow-square-out",
            kbds: ["enter"],
            onSelect: () => commands.openDetails(asset),
          },
        ]
      : []),
    ...(isBrowse && isEditableAsset(asset) && canWrite
      ? [
          {
            label: t("dms_media.actions.edit_image"),
            icon: "i-ph-crop",
            kbds: ["e"],
            onSelect: () => commands.edit(asset),
          },
        ]
      : []),
  ];
}

function fileShareItems(
  library: MediaLibrary,
  commands: MenuCommands,
  asset: MediaAsset,
): DropdownMenuItem[] {
  const { t } = library;
  return [
    {
      label: t("dms_media.actions.copy_link"),
      icon: "i-ph-link",
      onSelect: () => void commands.copyLink(asset),
    },
    {
      label: t("dms_media.actions.download"),
      icon: "i-ph-download-simple",
      onSelect: () => void library.actions.downloadAsset(asset),
    },
    {
      label: asset.starred
        ? t("dms_media.actions.unstar")
        : t("dms_media.actions.star"),
      icon: asset.starred ? "i-ph-star-fill" : "i-ph-star",
      onSelect: () => void library.actions.toggleStar(asset, "asset"),
    },
  ];
}

/** The menu of one file: view, share, and for a writer its changes and deletion. */
export function singleFileMenu(
  library: MediaLibrary,
  commands: MenuCommands,
  asset: MediaAsset,
): DropdownMenuItem[][] {
  const { t } = library;
  const canWrite = commands.canWriteAsset(asset);
  const groups = [
    fileViewItems(library, commands, asset, canWrite),
    fileShareItems(library, commands, asset),
  ];
  if (library.mode !== "browse" || !canWrite) return groups;
  return [
    ...groups,
    [
      {
        label: t("dms_media.actions.rename"),
        icon: "i-ph-pencil-simple",
        kbds: ["f2"],
        onSelect: afterMenu(() => commands.renameAsset(asset)),
      },
      {
        label: t("dms_media.actions.move"),
        icon: "i-ph-arrows-out-cardinal",
        kbds: ["m"],
        onSelect: afterMenu(() => commands.moveAssets([asset])),
      },
      ...(commands.canChangeVisibility(asset)
        ? [
            {
              label: t("dms_media.actions.visibility_ellipsis"),
              icon: "i-ph-globe",
              onSelect: afterMenu(() => commands.changeVisibility([asset])),
            },
          ]
        : []),
    ],
    [
      {
        label: t("dms_media.actions.delete"),
        icon: "i-ph-trash",
        color: "error",
        kbds: ["delete"],
        onSelect: afterMenu(() => commands.deleteAssets([asset])),
      },
    ],
  ];
}
