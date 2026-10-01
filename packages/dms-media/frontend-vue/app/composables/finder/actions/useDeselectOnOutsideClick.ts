import type { ComputedRef, Ref } from "vue";
import { onClickOutside } from "@vueuse/core";

type MaybeRef<T> = T | Ref<T> | ComputedRef<T>;
type TargetRef = Ref<HTMLElement | null | undefined>;
interface DeselectOptions {
  deselect: MaybeRef<boolean>;
  ignore: string[];
}

export const IGNORE_SELECTORS = [
  "[data-finder-panel]",
  "[data-finder-view-toggle]",
  "[data-finder-panel-toggle]",
  "[data-finder-panel-sidebar]",
  "[data-finder-panel-details]",
  "[data-finder-context-menu]",
  "[data-finder-picker-bar]",
  ".data-finder-card-item",
];

export function useDeselectOnOutsideClick<T>(
  targetRef: TargetRef,
  deselectFn: (value: T | null) => void,
  options: Partial<DeselectOptions> = {},
) {
  const { deselect = true, ignore = [] } = options;

  onClickOutside(
    targetRef,
    () => {
      const shouldDeselect = isRef(deselect) ? deselect.value : deselect;

      if (!shouldDeselect) return;

      deselectFn(null);
    },
    { ignore: [...IGNORE_SELECTORS, ...ignore] },
  );
}
