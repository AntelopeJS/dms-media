export function useFinderContextMenu() {
  const { t } = useI18n();
  const hooks = useFinderHooks();
  const map: HookMapping = {
    newFolder: "folder:new",
    refresh: "finder:refresh",
    sort: "finder:sort",
  };

  const contextMenuItems = computed(() =>
    createMenuBuilder(null, hooks, map, t)
      .group("newFolder")
      .group("refresh")
      .group([
        "sort",
        {
          children: [
            {
              label: t("dms.finder.sort.name"),
              onSelect: () => hooks.callHook("finder:sort", "name"),
            },
            {
              label: t("dms.finder.sort.date"),
              onSelect: () => hooks.callHook("finder:sort", "date"),
            },
            {
              label: t("dms.finder.sort.size"),
              onSelect: () => hooks.callHook("finder:sort", "size"),
            },
            {
              label: t("dms.finder.sort.type"),
              onSelect: () => hooks.callHook("finder:sort", "type"),
            },
          ],
        },
      ])
      .buildOnce(),
  );

  return { contextMenuItems };
}
