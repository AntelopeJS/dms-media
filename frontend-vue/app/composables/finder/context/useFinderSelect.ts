import type { InjectionKey, Ref } from "vue";
import type { FileExplorerItemPublic } from "../../../utils/finder/models";

interface SelectedItemContext {
  selectedItems: Ref<FileExplorerItemPublic[]>;
  anchorItem: Ref<FileExplorerItemPublic | null>;
  count: ComputedRef<number>;
  selectItem: (item: FileExplorerItemPublic) => void;
  deselectItem: (item: FileExplorerItemPublic) => void;
  toggleItem: (item: FileExplorerItemPublic) => void;
  isItemSelected: (item: FileExplorerItemPublic) => boolean;
  clearSelection: () => void;
}

const SYMBOL: InjectionKey<SelectedItemContext> = Symbol(
  "finder-selected-item",
);

export function useProvideFinderSelect() {
  const selectedItems = ref<FileExplorerItemPublic[]>([]);
  const anchorItem = ref<FileExplorerItemPublic | null>(null);

  const count = computed(() => selectedItems.value.length);

  function isItemSelected(item: FileExplorerItemPublic): boolean {
    return selectedItems.value.some((selected) => selected.id === item.id);
  }

  function selectItem(item: FileExplorerItemPublic): void {
    if (isItemSelected(item)) return;
    selectedItems.value = [...selectedItems.value, item];
  }

  function deselectItem(item: FileExplorerItemPublic): void {
    selectedItems.value = selectedItems.value.filter(
      (selected) => selected.id !== item.id,
    );
  }

  function toggleItem(item: FileExplorerItemPublic): void {
    if (isItemSelected(item)) {
      deselectItem(item);
    } else {
      selectItem(item);
    }
  }

  function clearSelection(): void {
    selectedItems.value = [];
  }

  const context: SelectedItemContext = {
    selectedItems,
    anchorItem,
    count,
    selectItem,
    deselectItem,
    toggleItem,
    isItemSelected,
    clearSelection,
  };

  provide(SYMBOL, context);

  return context;
}

export const useFinderSelect = () =>
  injectContext<SelectedItemContext>(SYMBOL, {
    contextName: "SelectedItemContext",
    providerName: "useProvideSelectedItem",
  });
