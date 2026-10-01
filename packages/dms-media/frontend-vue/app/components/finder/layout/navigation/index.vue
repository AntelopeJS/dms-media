<script setup lang="ts">
const { t } = useI18n();
const { previous, next } = useFinderNavigation();
const hooks = useFinderHooks();

const items = computed(() => [
  {
    icon: "i-lucide-arrow-left",
    label: t("dms.finder.navigation.previous"),
    click: () => hooks.callHook("navigate:previous"),
    disabled: previous.value.length === 0,
  },
  {
    icon: "i-lucide-arrow-right",
    label: t("dms.finder.navigation.next"),
    click: () => hooks.callHook("navigate:next"),
    disabled: next.value.length === 0,
  },
]);
</script>

<template>
  <div
    data-finder-navigation
    class="border-muted flex items-center gap-1 rounded-md border p-1"
  >
    <UTooltip v-for="item in items" :key="item.label" :text="item.label">
      <UButton
        :icon="item.icon"
        :variant="item.disabled ? 'soft' : 'ghost'"
        color="neutral"
        size="xs"
        square
        :aria-label="item.label"
        :disabled="item.disabled"
        @click="item.click"
      />
    </UTooltip>
  </div>
</template>
