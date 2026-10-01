<script setup lang="ts">
import type { FinderProps } from "../../types/finder";
import type { FileItemPublic } from "../../utils/finder/models";

useProvideFinderContext();
useProvideFinderLayout();
useProvideFinderHooks();
useProvideFinderNavigation();
useProvideFinderDragAndDrop();
const selection = useProvideFinderSelect();

interface RootProps extends FinderProps {
  initialBinding?: string;
}

interface Props extends FinderProps {
  root: RootProps;
  picker: boolean;
  pickerMultiple: boolean;
  pickerMimetypes: string[];
}

const props = defineProps<Partial<Props>>();

const emit = defineEmits<{
  pick: [files: FileItemPublic[]];
  cancel: [];
}>();

const { t } = useI18n();

function matchesMimetypes(file: FileItemPublic): boolean {
  const mimetypes = props.pickerMimetypes ?? [];
  if (!mimetypes.length) return true;
  return mimetypes.some((pattern) =>
    file.mimetype.startsWith(pattern.replace(/\*$/, "")),
  );
}

const pickableFiles = computed(() =>
  selection.selectedItems.value.filter(
    (item): item is FileItemPublic =>
      "mimetype" in item && matchesMimetypes(item as FileItemPublic),
  ),
);

useProvideFinderPicker({
  enabled: Boolean(props.picker),
  multiple: Boolean(props.pickerMultiple),
  matches: matchesMimetypes,
  pick: (files) => emit("pick", files),
});
</script>

<template>
  <div
    ref="finder-ref"
    class="flex min-h-0 shrink-0 flex-col justify-between sm:h-full sm:shrink"
  >
    <FinderLayoutHeader />

    <FinderRoot v-bind="root" />

    <FinderLayoutFooter />

    <div
      v-if="picker"
      data-finder-picker-bar
      class="flex items-center justify-end gap-2 border-t border-default p-3"
    >
      <span class="text-sm text-muted">
        {{ t("dms_media.picker.selected", { count: pickableFiles.length }) }}
      </span>
      <UButton
        color="neutral"
        variant="ghost"
        :label="t('dms_media.picker.cancel')"
        @click="emit('cancel')"
      />
      <UButton
        :disabled="pickableFiles.length === 0"
        :label="t('dms_media.picker.select')"
        @click="emit('pick', pickableFiles)"
      />
    </div>
  </div>
</template>
