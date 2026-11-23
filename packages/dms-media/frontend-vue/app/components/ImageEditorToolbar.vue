<script setup lang="ts">
import { QUARTER_TURN, ZOOM_STEP } from "../build/imageEditor/editorShapes";

defineProps<{ disabled: boolean }>();
const emit = defineEmits<{
  rotate: [angle: number];
  zoom: [factor: number];
  reset: [];
}>();
const { t } = useI18n();
</script>

<template>
  <div class="flex justify-center pb-4">
    <fieldset class="dms-card flex items-center gap-1 p-1" :disabled="disabled">
      <UTooltip :text="t('dms_media.editor.rotate_left')">
        <UButton
          icon="i-ph-arrow-counter-clockwise"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :aria-label="t('dms_media.editor.rotate_left')"
          @click="emit('rotate', -QUARTER_TURN)"
        />
      </UTooltip>
      <UTooltip :text="t('dms_media.editor.rotate_right')">
        <UButton
          icon="i-ph-arrow-clockwise"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :aria-label="t('dms_media.editor.rotate_right')"
          @click="emit('rotate', QUARTER_TURN)"
        />
      </UTooltip>
      <span class="bg-(--ui-border) mx-1 h-5 w-px" />
      <UTooltip :text="t('dms_media.editor.zoom_out')">
        <UButton
          icon="i-ph-magnifying-glass-minus"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :aria-label="t('dms_media.editor.zoom_out')"
          @click="emit('zoom', 1 / ZOOM_STEP)"
        />
      </UTooltip>
      <UTooltip :text="t('dms_media.editor.zoom_in')">
        <UButton
          icon="i-ph-magnifying-glass-plus"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :aria-label="t('dms_media.editor.zoom_in')"
          @click="emit('zoom', ZOOM_STEP)"
        />
      </UTooltip>
      <span class="bg-(--ui-border) mx-1 h-5 w-px" />
      <UButton
        icon="i-ph-arrow-u-up-left"
        color="neutral"
        variant="ghost"
        size="sm"
        :label="t('dms_media.editor.reset')"
        @click="emit('reset')"
      />
    </fieldset>
  </div>
</template>
