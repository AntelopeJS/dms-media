<script setup lang="ts">
const { t } = useI18n();
const { showDetails, globalShowDetails, toggleDetailsPanel } =
  useFinderLayout();

const panelLabel = computed(() => t("dms.finder.panel.details"));
</script>

<template>
  <div
    data-finder-panel-toggle
    class="border-muted flex items-center gap-1 rounded-md border p-1"
  >
    <UTooltip :text="panelLabel">
      <UButton
        icon="i-lucide-panel-right"
        :variant="showDetails ? 'soft' : 'ghost'"
        :color="showDetails ? 'primary' : 'neutral'"
        size="xs"
        :aria-label="panelLabel"
        square
        :disabled="!globalShowDetails"
        @click="toggleDetailsPanel"
      />
    </UTooltip>
  </div>
</template>
