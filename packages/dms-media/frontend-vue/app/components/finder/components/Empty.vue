<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <UEmpty
    :title="t('dms.finder.empty.title')"
    :description="t('dms.finder.empty.description')"
    icon="i-lucide-folder-open"
    variant="naked"
    class="size-full"
  />
</template>
