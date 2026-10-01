<script setup lang="ts">
import type { FinderProps } from "../../types/finder";

interface Props extends FinderProps {
  fullScreen?: boolean;
}

interface Emits {
  (e: "close"): void;
}

const props = withDefaults(defineProps<Props>(), {
  fullScreen: false,
});

const { t } = useI18n();

const coreProps = computed(() => {
  const { fullScreen: _fullScreen, ...rest } = props;
  return rest;
});

const emit = defineEmits<Emits>();

function handleClose() {
  emit("close");
}
</script>

<template>
  <UModal
    :title="t('dms.finder.title')"
    :close="{ onClick: handleClose }"
    :fullscreen="fullScreen"
    class="aspect-video w-[95vw] max-w-none sm:w-[90vw] md:w-[80vw] lg:w-[70vw] xl:w-[60vw] 2xl:w-[50vw]"
  >
    <template #body>
      <Finder v-bind="coreProps" />
    </template>
  </UModal>
</template>
