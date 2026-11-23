<script setup lang="ts">
defineProps<{ pendingCount: number; isSaving: boolean }>();
const emit = defineEmits<{ save: []; saveCopy: []; discard: [] }>();
const { t } = useI18n();
const { keyLabel } = useKeyboardPlatform();
</script>

<template>
  <footer class="mt-auto flex flex-col gap-2 p-4">
    <p class="text-muted flex items-start gap-2 text-[12px]">
      <UIcon name="i-ph-warning" class="text-warning mt-0.5 size-4 shrink-0" />
      {{ t("dms_media.editor.save_overwrites") }}
    </p>
    <UButton
      block
      icon="i-ph-check"
      :loading="isSaving"
      :disabled="pendingCount === 0"
      :label="
        pendingCount
          ? t('dms_media.editor.save', { count: pendingCount }, pendingCount)
          : t('dms_media.editor.save_none')
      "
      @click="emit('save')"
    >
      <template #trailing
        ><UKbd :value="keyLabel('meta')" size="sm" variant="subtle" /><UKbd
          value="S"
          size="sm"
          variant="subtle"
      /></template>
    </UButton>
    <div class="grid grid-cols-2 gap-2">
      <UButton
        block
        color="neutral"
        variant="outline"
        :label="t('dms_media.editor.discard')"
        @click="emit('discard')"
      />
      <UButton
        block
        color="neutral"
        variant="outline"
        icon="i-ph-copy"
        :loading="isSaving"
        :disabled="pendingCount === 0"
        :label="t('dms_media.editor.save_copy')"
        @click="emit('saveCopy')"
      />
    </div>
  </footer>
</template>
