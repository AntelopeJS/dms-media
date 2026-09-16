<script setup lang="ts">
import { useFocus } from "@vueuse/core";

interface Props {
  item: FileItemPublic | FolderItemPublic;
}

const props = defineProps<Props>();

const model = defineModel<string>();

const hooks = useFinderHooks();

const inputRef = useTemplateRef<{ inputRef: HTMLInputElement }>("input-ref");
const { focused } = useFocus(inputRef.value?.inputRef);

function handleBlur() {
  const value = model.value?.trim();
  const item = props.item;

  if (value) {
    item.name = value;

    const callback = {
      folder: () => hooks.callHook("folder:update", item as FolderItemPublic),
      file: () => hooks.callHook("file:update", item as FileItemPublic),
    };

    callback[item.type]?.();
  }

  handleReset();
}

function handleReset() {
  const item = props.item;

  const callback = {
    folder: () => hooks.callHook("folder:edit", null),
    file: () => hooks.callHook("file:edit", null),
  };

  callback[item.type]?.();
}

onMounted(() => {
  model.value = props.item.name;
  focused.value = true;
});
</script>

<template>
  <UInput
    v-model="model"
    class="w-full shrink-0 text-center text-xs"
    size="xs"
    autofocus
    @click.stop
    @blur="handleBlur"
    @keydown.enter="handleBlur"
    @keydown.escape="handleReset()"
  />
</template>
