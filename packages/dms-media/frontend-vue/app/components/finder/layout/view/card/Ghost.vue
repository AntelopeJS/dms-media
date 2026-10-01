<script setup lang="ts">
interface Props {
  icon: string;
  preview?: string;
}

defineProps<Props>();
const { count } = useFinderSelect();

const root = useTemplateRef<HTMLElement>("root");
const showCount = computed(() => count.value > 1);
defineExpose({ root });
</script>

<template>
  <div
    ref="root"
    :class="[
      'pointer-events-none fixed -left-[9999px]',
      'flex flex-col justify-center gap-1 align-middle',
      'size-full rounded-sm p-4 shadow-lg',
    ]"
  >
    <div class="relative size-full overflow-hidden">
      <UChip
        :text="count"
        position="bottom-left"
        :ui="{
          root: 'relative size-24',
          base: 'text-xl size-6 translate-x-1/4 -translate-y-1/4',
        }"
        :show="showCount"
      >
        <UAvatar
          :src="preview"
          :icon="icon"
          :ui="{
            root: 'size-full rounded-sm',
            image: 'object-cover aspect-square',
            icon: 'text-muted size-2/3',
          }"
        />
      </UChip>
    </div>
  </div>
</template>
