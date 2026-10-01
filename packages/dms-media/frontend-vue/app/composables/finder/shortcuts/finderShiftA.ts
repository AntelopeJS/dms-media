export const FINDER_SHIFT_A_METADATA: ShortcutMetadata = {
  key: ["$keyboard.shift", "a"],
  descriptionKey: "$dms.shortcuts.finder.shift_a.description",
  component: "$dms.components.finder",
};

export function createFinderShiftAShortcut(selectAll: () => void) {
  return () => selectAll();
}
