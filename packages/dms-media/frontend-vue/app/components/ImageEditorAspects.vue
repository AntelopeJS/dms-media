<script setup lang="ts">
import type { AspectOption } from "../utils/editorAspects";
import { FREE_ASPECT_ID } from "../utils/editorAspects";
import { KEY_STEPS } from "../build/imageEditor/editorShapes";

const props = defineProps<{
  options: AspectOption[];
  labelOf: (option: AspectOption) => string;
}>();
const aspect = defineModel<string>({ required: true });
const { t } = useI18n();
const group = useTemplateRef<HTMLElement>("group");

function choose(id: string): void {
  aspect.value = id;
  void nextTick(() =>
    group.value?.querySelector<HTMLElement>(`[data-aspect="${id}"]`)?.focus(),
  );
}

function move(event: KeyboardEvent): void {
  const step = KEY_STEPS[event.key];
  if (!step) return;
  event.preventDefault();
  const ids = props.options.map((option) => option.id);
  const index = ids.indexOf(aspect.value);
  const next = ids[(index + step.x + step.y + ids.length) % ids.length];
  if (next !== undefined) choose(next);
}
</script>

<template>
  <section class="border-default border-b p-4">
    <DmsEyebrowLabel
      :label="t('dms_media.editor.aspect_ratio')"
      tone="muted"
      class="mb-2"
    />
    <div
      ref="group"
      class="grid grid-cols-3 gap-1.5"
      role="radiogroup"
      :aria-label="t('dms_media.editor.aspect_ratio')"
      @keydown="move"
    >
      <button
        v-for="option in options"
        :key="option.id"
        type="button"
        role="radio"
        :data-aspect="option.id"
        :aria-checked="aspect === option.id"
        :tabindex="aspect === option.id ? 0 : -1"
        class="border-default flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-[12px]"
        :class="
          aspect === option.id
            ? 'border-(--ui-primary) bg-(--dms-accent-tint) text-highlighted'
            : 'text-muted hover:bg-(--dms-bg-muted)'
        "
        @click="aspect = option.id"
      >
        <UIcon
          :name="
            option.id === FREE_ASPECT_ID
              ? 'i-ph-selection'
              : option.ratio === 1
                ? 'i-ph-square'
                : 'i-ph-rectangle'
          "
          class="size-4"
          :class="{ 'rotate-90': (option.ratio ?? 1) < 1 }"
        />
        <span class="font-mono">{{ labelOf(option) }}</span>
        <span v-if="option.hint" class="text-dimmed text-[10px]">{{
          t(`dms_media.editor.aspect_hints.${option.hint}`)
        }}</span>
      </button>
    </div>
  </section>
</template>
