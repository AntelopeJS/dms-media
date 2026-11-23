import type { DropdownMenuItem } from "@nuxt/ui";
import type { MediaFolder } from "../../types/media";
import { afterMenu, type MenuCommands } from "./explorerMenuCommands";
import type { MediaLibrary } from "./useMediaLibrary";

function lockedItem(
  library: MediaLibrary,
  label: string,
  icon: string,
): DropdownMenuItem {
  return {
    label,
    icon,
    disabled: true,
    description: library.t("dms_media.markers.locked"),
  };
}

function folderBasics(
  library: MediaLibrary,
  commands: MenuCommands,
  folder: MediaFolder,
): DropdownMenuItem[] {
  const { t } = library;
  return [
    {
      label: t("dms_media.actions.open"),
      icon: "i-ph-folder-open",
      onSelect: () => void library.openFolder(folder.id),
    },
    ...(folder.rights.write
      ? [
          {
            label: t("dms_media.actions.upload_here"),
            icon: "i-ph-upload-simple",
            onSelect: afterMenu(() => commands.upload(folder.id)),
          },
        ]
      : []),
    ...(folder.rights.manage && folder.acceptsSubfolders
      ? [
          {
            label: t("dms_media.actions.new_subfolder"),
            icon: "i-ph-folder-plus",
            onSelect: afterMenu(() => commands.newFolder(folder.id)),
          },
        ]
      : []),
    {
      label: folder.starred
        ? t("dms_media.actions.unstar")
        : t("dms_media.actions.star"),
      icon: folder.starred ? "i-ph-star-fill" : "i-ph-star",
      onSelect: () => void library.actions.toggleStar(folder, "folder"),
    },
    {
      label: t("dms_media.actions.download_folder"),
      icon: "i-ph-file-zip",
      onSelect: () => void library.actions.downloadFolder(folder),
    },
  ];
}

function folderManagement(
  library: MediaLibrary,
  commands: MenuCommands,
  folder: MediaFolder,
): DropdownMenuItem[][] {
  const { t } = library;
  const visibility = commands.canChangeFolderVisibility(folder)
    ? [
        {
          label: t("dms_media.actions.visibility_ellipsis"),
          icon: "i-ph-globe",
          onSelect: afterMenu(() => commands.changeFolderVisibility(folder)),
        },
      ]
    : [];
  if (folder.bound)
    return [
      [
        lockedItem(
          library,
          t("dms_media.actions.rename"),
          "i-ph-pencil-simple",
        ),
        lockedItem(
          library,
          t("dms_media.actions.move"),
          "i-ph-arrows-out-cardinal",
        ),
        ...visibility,
        lockedItem(library, t("dms_media.actions.delete_folder"), "i-ph-trash"),
      ],
      [
        {
          label: t("dms_media.actions.why_locked"),
          icon: "i-ph-info",
          onSelect: afterMenu(() => commands.showLocked(folder)),
        },
      ],
    ];
  return [
    [
      {
        label: t("dms_media.actions.rename"),
        icon: "i-ph-pencil-simple",
        onSelect: afterMenu(() => commands.renameFolder(folder)),
      },
      {
        label: t("dms_media.actions.move"),
        icon: "i-ph-arrows-out-cardinal",
        onSelect: afterMenu(() => commands.moveFolder(folder)),
      },
      ...visibility,
    ],
    [
      {
        label: t("dms_media.actions.delete_folder"),
        icon: "i-ph-trash",
        color: "error",
        onSelect: afterMenu(() => commands.deleteFolder(folder)),
      },
    ],
  ];
}

/** The menu of one folder: what anyone may do, and for a manager its changes and deletion. */
export function folderMenu(
  library: MediaLibrary,
  commands: MenuCommands,
  folder: MediaFolder,
): DropdownMenuItem[][] {
  const groups: DropdownMenuItem[][] = [
    folderBasics(library, commands, folder),
  ];
  if (library.mode !== "browse" || !folder.rights.manage) return groups;
  return [...groups, ...folderManagement(library, commands, folder)];
}
