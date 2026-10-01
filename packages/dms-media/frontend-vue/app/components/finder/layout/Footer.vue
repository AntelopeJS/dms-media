<script setup lang="ts">
import type { ButtonProps } from "@nuxt/ui";

const { layout, gridSize } = useFinderLayout();
const { handleLoad } = useFinderStore();
const { t } = useI18n();
const isSyncing = ref(false);

const fileInputRef = useTemplateRef<HTMLInputElement>("file-input");

const { triggerUpload, multiple, onInputChange } =
  useFinderUpload(fileInputRef);
const { folderSize, elementsCount } = useFinderSize();

const actions = computed((): (ButtonProps & { name: string })[] => [
  {
    name: t("dms.finder.actions.upload"),
    icon: "i-lucide-cloud-upload",
    color: "neutral",
    variant: "soft",
    square: true,
    onClick: triggerUpload,
  },
  {
    name: t("dms.finder.actions.sync"),
    icon: isSyncing.value ? "i-lucide-loader-circle" : "i-lucide-cloud-sync",
    ui: {
      leadingIcon: isSyncing.value ? "animate-spin" : undefined,
    },
    variant: "soft",
    color: "neutral",
    square: true,
    disabled: isSyncing.value,
    onClick: handleSync,
  },
]);

async function handleSync() {
  isSyncing.value = true;

  setTimeout(async () => {
    isSyncing.value = false;
    await handleLoad();
  }, 3000);
}
</script>

<template>
  <div class="min-h-10">
    <FinderCoreToolbar position="footer">
      <template #left>
        <FinderLayoutNavigationBreadcrumbs />
      </template>

      <template #center>
        <p class="text-muted-foreground text-sm select-none">
          {{
            t("dms.finder.elements_count", {
              count: elementsCount,
              size: folderSize,
            })
          }}
        </p>
      </template>

      <template #right>
        <div class="flex items-center gap-4">
          <div v-if="layout === 'grid'" class="flex justify-end">
            <USlider
              v-model="gridSize"
              :min="1"
              :max="12"
              :step="1"
              class="w-32"
              size="xs"
            />
          </div>

          <UTooltip
            v-for="button in actions"
            :key="button.name"
            :text="button.name"
          >
            <UButton v-bind="button" />
          </UTooltip>
          <input
            ref="file-input"
            type="file"
            class="hidden"
            :multiple="multiple"
            @change="onInputChange"
          />
        </div>
      </template>
    </FinderCoreToolbar>
  </div>
</template>
