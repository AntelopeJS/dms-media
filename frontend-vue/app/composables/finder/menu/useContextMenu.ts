import type { ContextMenuItem } from "@nuxt/ui";
import type { ComputedRef, Ref } from "vue";
import { unref } from "vue";
import type { Hooks } from "../context/useFinderHooks";
import type { createHooks } from "hookable";
type ColorValue = string;

type MaybeRef<T> = T | Ref<T> | ComputedRef<T>;
type TranslateFunction = (key: string) => string;

export const CONTEXT_MENU_EVENTS = [
  "delete",
  "details",
  "download",
  "editImage",
  "newFolder",
  "open",
  "refresh",
  "rename",
  "share",
  "sort",
  "toggleFavorite",
  "upload",
  "update",
] as const;

export type ContextMenuEvent = (typeof CONTEXT_MENU_EVENTS)[number];

const CONTEXT_MENU_ICONS: Record<
  ContextMenuEvent,
  { icon: string; color?: ColorValue }
> = {
  delete: { icon: "i-heroicons-trash", color: Color.error },
  details: { icon: "i-heroicons-information-circle" },
  download: { icon: "i-heroicons-arrow-down-tray" },
  editImage: { icon: "i-heroicons-scissors" },
  toggleFavorite: { icon: "i-heroicons-star" },
  newFolder: { icon: "i-heroicons-folder-plus" },
  open: { icon: "i-heroicons-eye" },
  refresh: { icon: "i-heroicons-arrow-path" },
  rename: { icon: "i-heroicons-pencil" },
  share: { icon: "i-heroicons-share" },
  sort: { icon: "i-heroicons-arrow-up-down" },
  upload: { icon: "i-heroicons-arrow-up-tray" },
  update: { icon: "i-heroicons-arrow-path" },
};

const CONTEXT_MENU_KEYS: Record<ContextMenuEvent, string> = {
  delete: "dms.finder.actions.delete",
  details: "dms.finder.actions.details",
  download: "dms.finder.actions.download",
  editImage: "dms.finder.actions.edit_image",
  toggleFavorite: "dms.finder.actions.favorite",
  newFolder: "dms.finder.actions.new_folder",
  open: "dms.finder.actions.open",
  refresh: "dms.finder.actions.refresh",
  rename: "dms.finder.actions.rename",
  share: "dms.finder.actions.share",
  sort: "dms.finder.actions.sort",
  upload: "dms.finder.actions.upload",
  update: "dms.finder.actions.refresh",
};

function getContextMenuItems(
  t: TranslateFunction,
): Partial<Record<ContextMenuEvent, ContextMenuItem>> {
  const result: Partial<Record<ContextMenuEvent, ContextMenuItem>> = {};

  for (const event of CONTEXT_MENU_EVENTS) {
    const icons = CONTEXT_MENU_ICONS[event];
    const key = CONTEXT_MENU_KEYS[event];
    if (!icons || !key) continue;

    result[event] = {
      label: t(key),
      icon: icons.icon,
      color: icons.color,
    };
  }

  return result;
}

// Hook mappings
export type HookMapping = Partial<Record<ContextMenuEvent, keyof Hooks>>;

type MenuItemOptions<T> =
  | Partial<ContextMenuItem>
  | ((item: T) => Partial<ContextMenuItem>);

type MenuItemEntry<T> =
  | ContextMenuEvent
  | [ContextMenuEvent, MenuItemOptions<T>];

interface MenuBuilder<T> {
  group(...items: MenuItemEntry<T>[]): MenuBuilder<T>;
  build(): ComputedRef<ContextMenuItem[][]>;
  buildOnce(): ContextMenuItem[][];
}

function buildMenuItem<T>(
  entry: MenuItemEntry<T>,
  item: T | null,
  hooks: ReturnType<typeof createHooks<Hooks>>,
  hookMap: HookMapping,
  menuItems: Partial<Record<ContextMenuEvent, ContextMenuItem>>,
): ContextMenuItem | null {
  const [event, optionsOrFn = {}] = Array.isArray(entry) ? entry : [entry, {}];

  const base = menuItems[event];
  if (!base) return null;

  const resolvedOptions: Partial<ContextMenuItem> =
    typeof optionsOrFn === "function" && item !== null
      ? optionsOrFn(item)
      : (optionsOrFn as Partial<ContextMenuItem>);

  const hookName = hookMap[event];

  const onSelect =
    resolvedOptions.onSelect ??
    (hookName ? () => hooks.callHook(hookName, item as never) : undefined);

  return {
    ...base,
    ...resolvedOptions,
    onSelect,
  };
}

export function createMenuBuilder<T = undefined>(
  itemRef: MaybeRef<T | null> | null,
  hooks: ReturnType<typeof createHooks<Hooks>>,
  hookMap: HookMapping,
  t: TranslateFunction,
): MenuBuilder<T> {
  const groups: MenuItemEntry<T>[][] = [];
  const menuItems = getContextMenuItems(t);

  const builder: MenuBuilder<T> = {
    group(...items) {
      groups.push(items);
      return builder;
    },

    build() {
      return computed(() => {
        const item = itemRef !== null ? unref(itemRef) : null;
        if (itemRef !== null && !item) return [];

        return groups
          .map((group) =>
            group
              .map((entry) =>
                buildMenuItem(entry, item, hooks, hookMap, menuItems),
              )
              .filter((i): i is ContextMenuItem => Boolean(i)),
          )
          .filter((group) => group.length > 0);
      });
    },

    buildOnce() {
      const item = itemRef !== null ? unref(itemRef) : null;
      if (itemRef !== null && !item) return [];

      return groups
        .map((group) =>
          group
            .map((entry) =>
              buildMenuItem(entry, item, hooks, hookMap, menuItems),
            )
            .filter((i): i is ContextMenuItem => Boolean(i)),
        )
        .filter((group) => group.length > 0);
    },
  };

  return builder;
}
