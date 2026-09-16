<script setup lang="ts">
const { layout, setLayout, supportedLayouts } = useFinderLayout();
</script>

<template>
  <div
    v-if="supportedLayouts.length > 1"
    data-finder-view-toggle
    class="border-muted flex items-center gap-1 rounded-md border p-1"
  >
    <UTooltip
      v-for="mode in supportedLayouts"
      :key="mode.value"
      :text="mode.label"
    >
      <UButton
        :icon="mode.icon"
        :variant="layout === mode.value ? 'soft' : 'ghost'"
        :color="layout === mode.value ? 'primary' : 'neutral'"
        size="xs"
        square
        :aria-label="mode.label"
        @click="setLayout(mode.value)"
      />
    </UTooltip>
  </div>
</template>
