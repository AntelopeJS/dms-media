import type { BreadcrumbItem, DropdownMenuItem } from "@nuxt/ui";

export interface BreadcrumbItemWithClick extends BreadcrumbItem {
  click?: () => void;
  children?: DropdownMenuItem[];
}

interface Context {
  previous: Ref<Array<string[]>>;
  next: Ref<Array<string[]>>;
  current: Ref<string[]>;
}

const SYMBOL: InjectionKey<Context> = Symbol("finder-navigation");

/* Context */
export function useProvideFinderNavigation() {
  const previous = ref<Array<string[]>>([]);
  const next = ref<Array<string[]>>([]);

  const current = ref<string[]>([]);

  const context: Context = {
    previous,
    next,
    current,
  };

  provide(SYMBOL, context);
}

export const useFinderNavigation = () =>
  injectContext<Context>(SYMBOL, {
    contextName: "FinderNavigation",
    providerName: "useProvideFinderNavigation",
  });
