<script setup lang="ts">
import { useElementBounding, useEventListener, useMouse } from "@vueuse/core";
import { tv } from "tailwind-variants";

const theme = tv({
  slots: {
    root: "bg-default border-default relative max-h-full w-fit shrink-0 overflow-hidden",
  },
  variants: {
    side: {
      left: {
        root: "border-r border-default after:right-0 after:rounded-r-md",
      },
      right: {
        root: "border-l border-default after:left-0 after:rounded-l-md",
      },
    },
    active: {
      true: { root: "border-none after:bg-accented" },
      false: { root: "" },
    },
    resizeable: {
      true: {
        root: "after:content-[''] after:absolute after:top-0 after:h-full after:w-1 after:cursor-col-resize after:transition-[background-color] after:duration-150 hover:after:bg-muted",
      },
      false: { root: "" },
    },
  },
  defaultVariants: {
    side: "left",
    active: false,
    resizeable: true,
  },
});

export interface Props {
  minWidth: number;
  maxWidth: number;
  preferedWidth: number | null;
  collapsedWidth: number;
  collapsible: boolean;
  resizeable: boolean;
  side: "left" | "right";
}

const props = withDefaults(defineProps<Partial<Props>>(), {
  minWidth: 200,
  maxWidth: 500,
  collapsedWidth: 60,
  preferedWidth: 250,
  collapsed: false,
  collapsible: true,
  resizeable: true,
  side: "left",
});

const panelRef = useTemplateRef<HTMLDivElement>("panelRef");
const width = ref<number | null>(props.preferedWidth);
const isResizing = ref(false);
const isCollapsed = defineModel<boolean>("collapsed");

const { left, right } = useElementBounding(panelRef);
const { x: mouseX } = useMouse();

const ui = computed(() =>
  theme({
    side: props.side,
    active: isResizing.value,
    resizeable: props.resizeable,
  }),
);

const panelStyle = computed(() => {
  const _width =
    isCollapsed.value && props.collapsible ? props.collapsedWidth : width.value;

  return { width: `${_width}px` };
});

function handleResizeMouseDown(event: MouseEvent) {
  const target = event.target as HTMLElement;
  const rect = target.getBoundingClientRect();
  const isOnResizeEdge =
    props.side === "left"
      ? event.clientX >= rect.right - 8
      : event.clientX <= rect.left + 8;

  if (isOnResizeEdge) {
    isResizing.value = true;
  }
}

function handleMouseMove() {
  if (!isResizing.value) return;

  const newWidth =
    props.side === "left"
      ? mouseX.value - left.value
      : right.value - mouseX.value;

  width.value = props.resizeable
    ? Math.max(props.minWidth, Math.min(props.maxWidth, newWidth))
    : props.preferedWidth;
}

function handleMouseUp() {
  isResizing.value = false;
}

//Lifecycle
useEventListener(document, "mousemove", handleMouseMove);
useEventListener(document, "mouseup", handleMouseUp);
</script>

<template>
  <div
    ref="panelRef"
    v-bind="$attrs"
    data-finder-panel
    :data-state="isCollapsed ? 'collapsed' : 'expanded'"
    :data-collapsible="collapsible"
    :data-resizeable="resizeable"
    :data-side="side"
    :data-resizing="isResizing"
    :style="panelStyle"
    :class="ui.root()"
    @mousedown="resizeable && handleResizeMouseDown($event)"
  >
    <slot v-if="collapsed" name="collapsed" />
    <slot v-else name="default" />
  </div>
</template>
