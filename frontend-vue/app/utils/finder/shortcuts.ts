import {
  createFinderShiftAShortcut,
  FINDER_SHIFT_A_METADATA,
} from "../../composables/finder/shortcuts/finderShiftA";
import {
  createFinderEscapeShortcut,
  FINDER_ESCAPE_METADATA,
} from "../../composables/finder/shortcuts/finderEscape";

export const FINDER_SHORTCUTS_METADATA = [
  FINDER_SHIFT_A_METADATA,
  FINDER_ESCAPE_METADATA,
];

interface BuildFinderShortcutsParams {
  selectAll: () => void;
  clearSelection: () => void;
}

// TODO fix shortcut , they don't work
export function buildFinderShortcuts({
  selectAll,
  clearSelection,
}: BuildFinderShortcutsParams): Record<string, () => void> {
  return {
    shift_a: createFinderShiftAShortcut(selectAll),
    escape: createFinderEscapeShortcut(clearSelection),
  };
}
