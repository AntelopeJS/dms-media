<script setup lang="ts"></script>

<template>
  <FinderCoreToolbar position="header" class="bg-default sticky top-0 z-10">
    <template #left>
      <FinderLayoutNavigation />
    </template>

    <template #right>
      <FinderComponentsSearchFile />
      <FinderComponentsFilterMenu />
      <FinderLayoutViewToggle />
      <FinderLayoutPanelToogle />
    </template>
  </FinderCoreToolbar>
</template>
