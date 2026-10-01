export function useFavoritesFolder() {
  const cookie = useDmsCookie<string[]>("dms-favorite-folders", {
    default: () => [],
  });

  const favoriteFolderIds = useDmsState<string[]>(
    "dms-favorite-folders",
    () => cookie.value ?? [],
  );

  // Todo uiliser un inject pluitot que state
  const draggedFavoriteId = useDmsState<string | null>(
    "dms-dragged-favorite-id",
    () => null,
  );

  const syncToCookie = () => {
    cookie.value = favoriteFolderIds.value;
  };

  const isFavorite = (folderId: string): boolean => {
    return favoriteFolderIds.value.includes(folderId);
  };

  const toggleFavorite = (folderId: string): boolean => {
    const index = favoriteFolderIds.value.indexOf(folderId);

    if (index !== -1) {
      favoriteFolderIds.value.splice(index, 1);
      syncToCookie();
      return false;
    }

    favoriteFolderIds.value.push(folderId);
    syncToCookie();
    return true;
  };

  const addFavorite = (folderId: string): void => {
    if (!isFavorite(folderId)) {
      favoriteFolderIds.value.push(folderId);
      syncToCookie();
    }
  };

  const removeFavorite = (folderId: string): void => {
    const index = favoriteFolderIds.value.indexOf(folderId);
    if (index !== -1) {
      favoriteFolderIds.value.splice(index, 1);
      syncToCookie();
    }
  };

  const clearFavorites = (): void => {
    favoriteFolderIds.value = [];
    syncToCookie();
  };

  const cleanupInvalidFavorites = (
    isValidId: (id: string) => boolean,
  ): void => {
    const validIds = favoriteFolderIds.value.filter(isValidId);

    if (validIds.length !== favoriteFolderIds.value.length) {
      favoriteFolderIds.value = validIds;
      syncToCookie();
    }
  };

  const startFavoriteDrag = (folderId: string, event: DragEvent): void => {
    draggedFavoriteId.value = folderId;
    event.dataTransfer!.effectAllowed = "move";
    event.dataTransfer!.setData("application/finder-favorite", folderId);
  };

  const endFavoriteDrag = (
    event: DragEvent,
    panelRect: DOMRect | undefined,
  ): void => {
    if (!panelRect || !draggedFavoriteId.value) {
      draggedFavoriteId.value = null;
      return;
    }

    const isOutsidePanel =
      event.clientX < panelRect.left ||
      event.clientX > panelRect.right ||
      event.clientY < panelRect.top ||
      event.clientY > panelRect.bottom;

    if (isOutsidePanel) {
      removeFavorite(draggedFavoriteId.value);
    }

    draggedFavoriteId.value = null;
  };

  return {
    favoriteFolderIds,
    draggedFavoriteId,
    isFavorite,
    toggleFavorite,
    addFavorite,
    removeFavorite,
    clearFavorites,
    cleanupInvalidFavorites,
    startFavoriteDrag,
    endFavoriteDrag,
  };
};
