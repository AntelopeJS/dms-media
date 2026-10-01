export function createNavigationHooksRegistrar(): HookRegistrar {
  return () => {
    const { previous, next, current } = useFinderNavigation();
    const { map } = useFinderStore();
    const { openedFolder, currentFolder, currentFile } = useFinderContext();
    const hooks = useFinderHooks();

    hooks.hook("navigate:previous", () => {
      if (previous.value.length === 0) return;

      next.value.push([...current.value]);

      const previousPath = previous.value.pop() ?? [];
      current.value = previousPath;

      const targetId = previousPath.at(-1);
      if (!targetId) {
        openedFolder.value = null;
        currentFolder.value = null;
        currentFile.value = null;
        return;
      }

      const folder = map.value.folders.get(targetId);
      if (folder) {
        openedFolder.value = folder;
        currentFolder.value = folder;
        currentFile.value = null;
        hooks.callHook("select:folder", folder);
      }
    });

    hooks.hook("navigate:next", () => {
      if (next.value.length === 0) return;

      previous.value.push([...current.value]);

      const nextPath = next.value.pop() ?? [];
      current.value = nextPath;

      const targetId = nextPath.at(-1);
      if (!targetId) {
        openedFolder.value = null;
        currentFolder.value = null;
        currentFile.value = null;
        return;
      }

      const folder = map.value.folders.get(targetId);
      if (folder) {
        openedFolder.value = folder;
        currentFolder.value = folder;
        currentFile.value = null;
        hooks.callHook("select:folder", folder);
      }
    });

    hooks.hook("navigate:to", () => {
      previous.value.push([...current.value]);
      current.value = openedFolder.value?.path ?? [];
      next.value = [];
    });
  };
}
