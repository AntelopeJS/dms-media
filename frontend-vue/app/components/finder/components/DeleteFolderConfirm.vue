<script setup lang="ts">
interface Props {
  title?: string;
  description?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: undefined,
  description: undefined,
});

const emit = defineEmits<{ close: [confirmed: boolean] }>();

const { t } = useI18n();

const modalTitle = computed(
  () => props.title ?? t("dms.finder.delete.confirm_title"),
);

const modalDescription = computed(
  () => props.description ?? t("dms.finder.delete.confirm_description"),
);
</script>

<template>
  <UModal :title="modalTitle">
    <template #body>
      <div class="flex items-center gap-4">
        <UIcon
          name="i-lucide-alert-triangle"
          class="text-warning size-6 shrink-0"
        />
        <p class="text-dimmed">
          {{ modalDescription }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          :label="t('dms.finder.delete.cancel')"
          color="neutral"
          variant="ghost"
          @click="emit('close', false)"
        />
        <UButton
          :label="t('dms.finder.delete.delete')"
          color="error"
          variant="solid"
          @click="emit('close', true)"
        />
      </div>
    </template>
  </UModal>
</template>
