<script setup lang="ts">
import { Cropper } from "vue-advanced-cropper";
import "vue-advanced-cropper/dist/style.css";
import type { FileItemPublic } from "../../../utils/finder/models";
import type { MediaAssetDto } from "../../../composables/finder/api/useMediaApi";

interface Props {
  file: FileItemPublic;
}

const props = defineProps<Props>();

const emit = defineEmits<{ close: [changed: boolean] }>();

const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const api = useMediaApi();

function closeWith(changed: boolean): void {
  emit("close", changed);
  open.value = false;
}

const imageUrl = ref<string>();
const asset = ref<MediaAssetDto>();
const isBusy = ref(false);
const hasChanged = ref(false);
const loadFailed = ref(false);
const cropperRef = ref();

async function refresh(): Promise<void> {
  loadFailed.value = false;
  try {
    const [detail, readUrl] = await Promise.all([
      api.fetchAsset(props.file.id),
      api.fetchReadUrl(props.file.id),
    ]);
    asset.value = detail.asset;
    imageUrl.value = readUrl.url;
  } catch {
    imageUrl.value = undefined;
    loadFailed.value = true;
  }
}

onMounted(refresh);

async function runEdit(action: () => Promise<unknown>): Promise<void> {
  if (isBusy.value) return;
  try {
    isBusy.value = true;
    await action();
    hasChanged.value = true;
    await refresh();
  } catch (error) {
    console.error("[FINDER] EDIT IMAGE", error);
  } finally {
    isBusy.value = false;
  }
}

function rotate(angle: number): void {
  void runEdit(() => api.transformAsset(props.file.id, { rotate: angle }));
}

function applyCrop(): void {
  const result = cropperRef.value?.getResult();
  if (!result?.coordinates || !result?.image?.width || !result?.image?.height) {
    return;
  }
  const { coordinates, image } = result;
  const crop = {
    x: Math.max(0, coordinates.left / image.width),
    y: Math.max(0, coordinates.top / image.height),
    width: Math.min(1, coordinates.width / image.width),
    height: Math.min(1, coordinates.height / image.height),
  };
  void runEdit(() => api.transformAsset(props.file.id, { crop }));
}

function revert(): void {
  void runEdit(() => api.revertAsset(props.file.id));
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('dms_media.edit.title', { name: file.name })"
    :close="{ onClick: () => closeWith(hasChanged) }"
    class="max-w-3xl"
  >
    <template #body>
      <ClientOnly>
        <Cropper
          v-if="imageUrl"
          ref="cropperRef"
          :src="imageUrl"
          class="h-[50vh] bg-elevated"
        />
        <p
          v-else-if="loadFailed"
          class="py-8 text-center text-sm text-muted"
        >
          {{ t("dms_media.edit.load_error") }}
        </p>
      </ClientOnly>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <div class="flex gap-2">
          <UButton
            icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="soft"
            :disabled="isBusy"
            :label="t('dms_media.edit.rotate_left')"
            @click="rotate(270)"
          />
          <UButton
            icon="i-lucide-rotate-cw"
            color="neutral"
            variant="soft"
            :disabled="isBusy"
            :label="t('dms_media.edit.rotate_right')"
            @click="rotate(90)"
          />
          <UButton
            icon="i-lucide-crop"
            color="neutral"
            variant="soft"
            :disabled="isBusy"
            :label="t('dms_media.edit.apply_crop')"
            @click="applyCrop"
          />
        </div>
        <div class="flex gap-2">
          <UButton
            v-if="asset?.hasOriginal"
            icon="i-lucide-undo-2"
            color="warning"
            variant="soft"
            :disabled="isBusy"
            :label="t('dms_media.edit.revert')"
            @click="revert"
          />
          <UButton
            :label="t('dms_media.edit.done')"
            :loading="isBusy"
            @click="closeWith(hasChanged)"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
