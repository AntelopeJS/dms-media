export function createFinderHooksRegistrar(): HookRegistrar {
  return () => {
    const { handleLoad, handleMoveItem } = useFinderStore();
    const { setDetailsPanel } = useFinderLayout();

    const hooks = useFinderHooks();

    hooks.hook("finder:refresh", () => {
      handleLoad();
    });

    hooks.hook("finder:sort", (by) => {
      console.log(
        "[FINDER] FINDER HOOKS - finder:sort : missing implementation",
        by,
      );
    });

    hooks.hook("finder:details:active", () => {
      setDetailsPanel(true);
    });

    hooks.hook("finder:move:item", handleMoveItem);
  };
}
