<script setup lang="ts">
interface Props {
  placeholder?: string;
}

const props = defineProps<Props>();
const model = defineModel<string>({ default: "" });

const { t } = useI18n();

const placeholderText = computed(
  () => props.placeholder ?? t("dms.finder.search_placeholder"),
);
</script>

<template>
  <UInput
    v-model="model"
    :placeholder="placeholderText"
    icon="i-heroicons-magnifying-glass"
    size="md"
    v-bind="$attrs"
  />
</template>
