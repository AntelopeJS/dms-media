export const FINDER_ESCAPE_METADATA: ShortcutMetadata = {
  key: ["$keyboard.escape"],
  descriptionKey: "$dms.shortcuts.finder.escape.description",
  component: "$dms.components.finder",
};

export function createFinderEscapeShortcut(clearSelection: () => void) {
  return () => clearSelection();
}
