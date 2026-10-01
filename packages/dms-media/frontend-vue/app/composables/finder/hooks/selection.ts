export function createSelectionHooksRegistrar(): HookRegistrar {
  return () => {
    const { selectedItems, toggleItem, clearSelection, deselectItem } =
      useFinderSelect();
    const hooks = useFinderHooks();

    hooks.hook("select:file", (file) => {
      toggleItem(file);
    });

    hooks.hook("select:folder", (folder) => {
      toggleItem(folder);
    });

    hooks.hook("select:item:toggle", (item) => {
      toggleItem(item);
    });

    hooks.hook("select:item:clear", () => {
      clearSelection();
    });

    hooks.hook("deselect:item", (item) => {
      deselectItem(item);
    });

    hooks.hook("select:item:all", (items) => {
      selectedItems.value = [...items];
    });
  };
}
