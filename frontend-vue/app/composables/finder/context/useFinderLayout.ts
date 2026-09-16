import type { CSSProperties } from "vue";

export type Layout = "grid" | "list" | "columns";

interface Mode {
  value: Layout;
  icon: string;
  label: string;
}

interface Preferences {
  layout: Layout;
  gridSize: number;
}

interface Context {
  is: ComputedRef<{ list: boolean; columns: boolean; grid: boolean }>;
  layout: WritableComputedRef<Layout>;
  supportedLayouts: ComputedRef<Mode[]>;
  gridSize: WritableComputedRef<number>;
  gridStyle: ComputedRef<{ layout: CSSProperties; card: CSSProperties }>;
  showDetails: WritableComputedRef<boolean>;
  globalShowDetails: Ref<boolean>;

  setLayout: (newLayout: Layout) => void;
  setDefaultLayout: (newDefaultLayout: Layout) => void;
  setSupportedLayouts: (layouts: Layout[]) => void;
  isAllowed: (layoutValue: Layout) => boolean;
  setDetailsPanel: (show: boolean) => void;
  toggleDetailsPanel: () => void;
  setGlobalShowDetails: (show: boolean) => void;
}

const SYMBOL: InjectionKey<Context> = Symbol("filexplorer-layout");

const MODE_ICONS: Record<Layout, string> = {
  grid: "i-lucide-grid-2x2",
  list: "i-lucide-list",
  columns: "i-lucide-columns-3",
};

const MODE_KEYS: Record<Layout, string> = {
  grid: "dms.finder.layout.grid",
  list: "dms.finder.layout.list",
  columns: "dms.finder.layout.columns",
};

export function useProvideFinderLayout() {
  const { t } = useI18n();
  const preferences = useDmsCookie<Preferences>("finder-preferences", {
    default: () => ({ layout: "grid", gridSize: 4 }),
  });

  const _defaultLayout = ref<Layout>(preferences.value.layout);
  const _supportedLayouts = ref<Layout[]>(["grid", "list", "columns"]);

  const GRID_CARD_SIZES = [
    40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260,
  ] as const;

  /** Root state inherited from Root component props showDetails */
  const globalShowDetails = ref(false);
  const _showDetails = ref(false);
  const showDetails = computed({
    get: () => globalShowDetails.value && _showDetails.value,
    set: (val) => {
      _showDetails.value = val;
    },
  });

  /* Data */
  // Layout
  const layout = computed({
    get: () => preferences.value.layout,
    set: (val) => {
      preferences.value = { ...preferences.value, layout: val };
    },
  });

  const is = computed(() => ({
    grid: isAllowed("grid") && layout.value === "grid",
    list: isAllowed("list") && layout.value === "list",
    columns: isAllowed("columns") && layout.value === "columns",
  }));

  const supportedLayouts = computed(() =>
    _supportedLayouts.value.map(
      (value): Mode => ({
        value,
        icon: MODE_ICONS[value],
        label: t(MODE_KEYS[value]),
      }),
    ),
  );

  // Grid
  const gridSize = computed({
    get: () => preferences.value.gridSize,
    set: (val) => {
      preferences.value = { ...preferences.value, gridSize: val };
    },
  });

  const gridStyle = computed(() => {
    const cardSize = getGridCardSize(gridSize.value);

    const layout = {
      display: "grid",
      gridTemplateColumns: `repeat(auto-fill, minmax(min(${cardSize}px, 100%), 1fr))`,
    };

    const card = {
      width: `${cardSize}px`,
      aspectRatio: "1/1",
    };

    return {
      layout,
      card,
    };
  });

  /* Methods */
  function isAllowed(layoutValue: Layout) {
    return _supportedLayouts.value.includes(layoutValue);
  }

  function setDefaultLayout(newDefaultLayout: Layout) {
    _defaultLayout.value = newDefaultLayout;
  }

  function setLayout(newLayout: Layout) {
    if (!isAllowed(newLayout)) return;
    layout.value = newLayout;
  }

  function setSupportedLayouts(layouts: Layout[]) {
    _supportedLayouts.value = layouts;

    if (layouts.includes(layout.value)) return;

    layout.value = layouts[0] ?? _defaultLayout.value;
  }

  function setGlobalShowDetails(show: boolean) {
    globalShowDetails.value = show;
  }

  function getGridCardSize(sizeIndex: number): number {
    const index = Math.max(
      0,
      Math.min(GRID_CARD_SIZES.length - 1, sizeIndex - 1),
    );
    return GRID_CARD_SIZES[index] ?? GRID_CARD_SIZES[0];
  }

  function setDetailsPanel(show: boolean) {
    showDetails.value = show;
  }

  function toggleDetailsPanel() {
    showDetails.value = !showDetails.value;
  }

  /* Return */
  const context = {
    is,
    layout,
    supportedLayouts,
    gridSize,
    gridStyle,
    showDetails,
    globalShowDetails,

    isAllowed,
    setDefaultLayout,
    setLayout,
    setSupportedLayouts,
    setGlobalShowDetails,
    setDetailsPanel,
    toggleDetailsPanel,
  };

  provide(SYMBOL, context);
}

export const useFinderLayout = () =>
  injectContext<Context>(SYMBOL, {
    contextName: "FinderLayout",
    providerName: "useProvideFinderLayout",
  });
