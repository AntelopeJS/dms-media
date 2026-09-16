<script setup lang="ts">
import { tv } from "tailwind-variants";

const theme = tv({
  slots: {
    root: "grid grid-cols-1 gap-4 py-4 sm:grid-cols-[auto_1fr_auto] sm:items-center border-default",
    slot: "flex items-center gap-4",
  },
  variants: {
    position: {
      header: { root: "border-b" },
      footer: { root: "border-t" },
    },
    align: {
      left: { slot: "justify-start" },
      center: { slot: "justify-center" },
      right: { slot: "justify-end" },
    },
  },
  defaultVariants: {
    position: "header",
  },
});

interface Props {
  position: "header" | "footer";
  ui: Partial<typeof theme.slots>;
  class: any;
}

const props = withDefaults(defineProps<Partial<Props>>(), {
  position: "header",
  ui: () => ({}),
  class: "",
});

const SLOT_ORDER = ["left", "center", "right"] as const;

const ui = computed(() => theme({ position: props.position }));
</script>

<template>
  <div
    :class="ui.root({ class: [props.class, props.ui.root] })"
    v-bind="$attrs"
  >
    <div
      v-for="name in SLOT_ORDER"
      :key="name"
      :class="ui.slot({ class: props.ui.slot })"
    >
      <slot :name="name" />
    </div>
  </div>
</template>
