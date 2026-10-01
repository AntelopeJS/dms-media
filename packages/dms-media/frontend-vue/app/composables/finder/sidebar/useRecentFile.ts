interface Props {
  limit?: number;
  offset?: number;
}

export async function useRecentFile(options?: Props) {
  const { limit = 10, offset = 0 } = options ?? {};

  const { items } = useFinderStore();

  const recentFiles = computed(() =>
    items.value.files
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(offset, offset + limit),
  );

  return {
    recentFiles,
  };
};
