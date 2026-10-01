import type { InjectionKey, Ref } from "vue";
import type { FileItemPublic, FolderItemPublic } from "../../../utils/finder/models";

interface Context {
  currentFolder: Ref<FolderItemPublic | null>;
  openedFolder: Ref<FolderItemPublic | null>;
  editedFolder: Ref<FolderItemPublic | null>;

  currentFile: Ref<FileItemPublic | null>;
  editedFile: Ref<FileItemPublic | null>;

  isCurrent: (item: FileItemPublic | FolderItemPublic) => boolean;
  isEdited: (item: FileItemPublic | FolderItemPublic) => boolean;
}

const SYMBOL: InjectionKey<Context> = Symbol("finder-context");

export function useProvideFinderContext() {
  const currentFolder = ref<FolderItemPublic | null>(null);
  const openedFolder = ref<FolderItemPublic | null>(null);
  const editedFolder = ref<FolderItemPublic | null>(null);

  const currentFile = ref<FileItemPublic | null>(null);
  const editedFile = ref<FileItemPublic | null>(null);

  function isCurrent(item: FileItemPublic | FolderItemPublic) {
    return (
      currentFile.value?.id === item.id || currentFolder.value?.id === item.id
    );
  }

  function isEdited(item: FileItemPublic | FolderItemPublic) {
    return (
      editedFile.value?.id === item.id || editedFolder.value?.id === item.id
    );
  }

  const context: Context = {
    currentFolder,
    openedFolder,
    editedFolder,
    currentFile,
    editedFile,
    isCurrent,
    isEdited,
  };

  provide(SYMBOL, context);
}

export const useFinderContext = () =>
  injectContext<Context>(SYMBOL, {
    contextName: "FinderContext",
    providerName: "useProvideFinderContext",
  });
