import type { SortBy } from "../../../types/finder";
import { createHooks } from "hookable";
import type { InjectionKey } from "vue";

export type HookRegistrar = () => void;
export type HookRegistrarFactory = () => HookRegistrar;

interface FinderHooksBuilder {
  register(factory: HookRegistrarFactory): FinderHooksBuilder;
  build(): void;
}

export interface Hooks {
  // File
  "file:preview:open": (file: FileItemPublic) => void;
  "file:edit-image": (file: FileItemPublic) => void;
  "file:activate": (file: FileItemPublic) => void;
  "file:download": (file: FileItemPublic) => void;
  "file:rename": (file: FileItemPublic) => void;
  "file:delete": (file: FileItemPublic) => void;
  "file:share": (file: FileItemPublic) => void;
  "file:update": (file: FileItemPublic) => void;
  "file:edit": (file: FileItemPublic | null) => void;
  "file:details:active": (file: FileItemPublic | null) => void;
  "file:details:inactive": () => void;

  // Folder
  "folder:open": (folder: FolderItemPublic | null) => void;
  "folder:rename": (folder: FolderItemPublic) => void;
  "folder:delete": (folder: FolderItemPublic) => void;
  "folder:new": (folder: FolderItemPublic) => void;
  "folder:toggleFavorite": (folder: FolderItemPublic) => void;
  "folder:update": (folder: FolderItemPublic) => void;
  "folder:edit": (folder: FolderItemPublic | null) => void;
  "folder:details:activate": (folder: FolderItemPublic) => void;
  "folder:details:inactive": () => void;

  // Finder
  "finder:upload": () => void;
  "finder:refresh": () => void;
  "finder:sort": (by: SortBy) => void;
  "finder:details:active": () => void;

  // Navigation
  "navigate:previous": () => void;
  "navigate:next": () => void;
  "navigate:to": () => void;

  // Drag & Drop
  "finder:move:item": (itemId: string, targetFolderId: string | null) => void;

  // Selection
  "select:file": (file: FileExplorerItemPublic) => void;
  "select:folder": (folder: FileExplorerItemPublic) => void;
  "deselect:item": (item: FileExplorerItemPublic) => void;
  "select:item:toggle": (item: FileExplorerItemPublic) => void;
  "select:item:clear": () => void;
  "select:item:all": (items: FileExplorerItemPublic[]) => void;
}

type Context = ReturnType<typeof createHooks<Hooks>>;

const SYMBOL: InjectionKey<Context> = Symbol("finder-hooks");

/* Context */
export function useProvideFinderHooks() {
  const hooks = createHooks<Hooks>();

  provide(SYMBOL, hooks);
}

export const useFinderHooks = () =>
  injectContext<Context>(SYMBOL, {
    contextName: "FinderHooks",
    providerName: "useProvideFinderHooks",
  });

/* Register */
export function useFinderHooksBuilder(): FinderHooksBuilder {
  const factories: HookRegistrarFactory[] = [];

  const builder: FinderHooksBuilder = {
    register(factory: HookRegistrarFactory) {
      factories.push(factory);
      return builder;
    },
    build() {
      factories.forEach((factory) => factory()());
    },
  };

  return builder;
}
