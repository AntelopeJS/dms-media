const VISIBLE_DUPLICATE_NAMES = 6;

export type KeepBothPrompt = (
  folderName: string,
  names: string[],
) => Promise<boolean>;

/** "Keep both" asked with the DMS confirm dialog, listing the names already taken. */
export function createKeepBothPrompt(): KeepBothPrompt {
  const { confirm } = useConfirm();
  const { t } = useI18n();
  return (folderName, names) => {
    const hidden = names.length - VISIBLE_DUPLICATE_NAMES;
    return confirm({
      title: t(
        "dms_media.dialogs.duplicates.title",
        { count: names.length },
        names.length,
      ),
      description: t("dms_media.dialogs.duplicates.description", {
        name: folderName,
      }),
      color: "warning",
      icon: "i-ph-copy",
      confirmIcon: "i-ph-copy",
      confirmLabel: t("dms_media.dialogs.duplicates.keep_both"),
      cancelLabel: t("dms_media.actions.cancel"),
      impact: [
        ...names
          .slice(0, VISIBLE_DUPLICATE_NAMES)
          .map((name) => ({ icon: "i-ph-file", label: name })),
        ...(hidden > 0
          ? [
              {
                icon: "i-ph-dots-three",
                label: t(
                  "dms_media.dialogs.duplicates.more",
                  { count: hidden },
                  hidden,
                ),
              },
            ]
          : []),
      ],
    });
  };
}
