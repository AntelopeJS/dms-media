<script setup lang="ts">
import { useMounted } from "@vueuse/core";
import { Cropper, Preview } from "vue-advanced-cropper";
import "vue-advanced-cropper/dist/style.css";
import type {
  AssetDetails,
  DeliveryPreset,
  MediaAsset,
  PresetsResponse,
} from "../types/media";
import type { TransformOperations } from "../composables/useMediaApi";
import {
  type AspectOption,
  aspectOptions,
  FREE_ASPECT_ID,
  ORIGINAL_ASPECT_ID,
  type PixelSize,
  rotatedSize as turnSize,
} from "../utils/editorAspects";
import {
  centeredRegion,
  type CropCoordinates,
  type CropField,
  type CropperChange,
  type CropperHandle,
  editingSource,
  FULL_TURN,
  fullImage,
  KEY_STEPS,
  type LoadState,
  NUDGE_RATIO,
  type PendingChange,
  PRESET_PREVIEW_SIZE,
  type PresetPreview,
  VECTOR_MIMETYPE,
} from "../build/imageEditor/editorShapes";
import { useEditorSaving } from "../build/imageEditor/useEditorSaving";
import ImageEditorAspects from "./ImageEditorAspects.vue";
import ImageEditorFooter from "./ImageEditorFooter.vue";
import ImageEditorToolbar from "./ImageEditorToolbar.vue";

const route = useDmsRoute();
const api = useMediaApi();
const { t } = useI18n();
const toast = useToast();
const format = useMediaFormat();
const { confirm } = useConfirm();
const cropper = useTemplateRef<CropperHandle>("cropper");
const stage = useTemplateRef<HTMLElement>("stage");
const isMounted = useMounted();
const source = ref<string | null>(null);
const sourceFailed = ref(false);
/** Counts the retries, so that a retry loads the image again. */
const attempt = ref(0);
const rotation = ref(0);
const aspect = ref(FREE_ASPECT_ID);
const change = ref<CropperChange | null>(null);
const isSaving = ref(false);
const isCropperReady = ref(false);

const assetId = computed(() => {
  const value = route.query.asset;
  return Array.isArray(value) ? undefined : (value ?? undefined);
});
/** The file's details, read with the page: a server render shows its name and whether it can be edited. */
const detailsRead = useApiData<AssetDetails>(() =>
  assetId.value ? MEDIA_READS.details(assetId.value) : null,
);
const details = computed(() =>
  detailsRead.error.value || detailsRead.placeholder.value
    ? null
    : detailsRead.data.value,
);
const asset = computed(() => details.value?.asset);
const isEditable = computed(() =>
  Boolean(asset.value && isEditableAsset(asset.value)),
);
/** The delivery sizes previewed under the crop, which only the browser draws: left to the browser. */
const presetsRead = useApiData<PresetsResponse>(
  () => (isEditable.value ? MEDIA_READS.presets : null),
  { server: false },
);
const presets = computed<DeliveryPreset[]>(
  () => presetsRead.data.value?.presets ?? [],
);
const loadState = computed<LoadState>(() => {
  const error = detailsRead.error.value;
  if (error && detailsRead.status.value !== "pending")
    return isOutOfReachError(error) ? "missing" : "error";
  if (sourceFailed.value) return "error";
  return asset.value ? "ready" : "loading";
});
const isEditing = computed(
  () => loadState.value === "ready" && isEditable.value,
);

const imageSize = computed<PixelSize | undefined>(() => {
  const image = change.value?.image;
  return image ? { width: image.width, height: image.height } : undefined;
});
const rotatedSize = computed(() =>
  imageSize.value ? turnSize(imageSize.value, rotation.value) : undefined,
);
const pixelScale = computed(() => {
  const image = imageSize.value;
  const width = asset.value?.width;
  const height = asset.value?.height;
  if (!image || !width || !height) return 1;
  return Math.max(width, height) / Math.max(image.width, image.height);
});

const aspects = computed<AspectOption[]>(() =>
  aspectOptions(rotatedSize.value),
);
const stencilRatio = computed(
  () => aspects.value.find((option) => option.id === aspect.value)?.ratio,
);
const cropChanged = computed(() => {
  const coordinates = change.value?.coordinates;
  const size = rotatedSize.value;
  if (!coordinates || !size) return false;
  return (
    coordinates.width < size.width - 1 || coordinates.height < size.height - 1
  );
});

function aspectLabel(option: AspectOption): string {
  return option.id === FREE_ASPECT_ID
    ? t("dms_media.editor.aspects.free")
    : option.label;
}

function toPixels(value: number): number {
  return Math.round(value * pixelScale.value);
}

const pending = computed<PendingChange[]>(() => {
  const changes: PendingChange[] = [];
  if (rotation.value)
    changes.push({
      icon: "i-ph-arrow-clockwise",
      label: t("dms_media.editor.rotate_change", { degrees: rotation.value }),
      detail: t("dms_media.editor.applied_first"),
    });
  const coordinates = change.value?.coordinates;
  if (cropChanged.value && coordinates) {
    const option = aspects.value.find(
      (candidate) => candidate.id === aspect.value,
    );
    changes.push({
      icon: "i-ph-crop",
      label:
        !option || option.id === FREE_ASPECT_ID
          ? t("dms_media.editor.crop_free")
          : t("dms_media.editor.crop_to", { ratio: aspectLabel(option) }),
      detail: format.formatDimensions(
        toPixels(coordinates.width),
        toPixels(coordinates.height),
      ),
    });
  }
  return changes;
});
const hasChanges = () => pending.value.length > 0;

const cropFields = computed<CropField[]>(() => [
  { key: "left", label: t("dms_media.editor.crop_fields.x") },
  { key: "top", label: t("dms_media.editor.crop_fields.y") },
  { key: "width", label: t("dms_media.editor.crop_fields.width") },
  { key: "height", label: t("dms_media.editor.crop_fields.height") },
]);

function presetLabel(preset: DeliveryPreset): string {
  const size =
    preset.width && preset.height
      ? format.formatDimensions(preset.width, preset.height)
      : String(preset.width ?? preset.height ?? "");
  return `${preset.id} · ${size}`;
}

const presetPreviews = computed<PresetPreview[]>(() => {
  const coordinates = change.value?.coordinates;
  if (!coordinates) return [];
  return presets.value.map((preset) => {
    const { width, height } = preset;
    const region =
      preset.fit === "cover" && width && height
        ? centeredRegion(coordinates, width / height)
        : coordinates;
    const scale = PRESET_PREVIEW_SIZE / Math.max(region.width, region.height);
    return {
      id: preset.id,
      label: presetLabel(preset),
      width: Math.round(region.width * scale),
      height: Math.round(region.height * scale),
      coordinates: region,
    };
  });
});

function resetEdits(): void {
  rotation.value = 0;
  aspect.value = FREE_ASPECT_ID;
  change.value = null;
  isCropperReady.value = false;
}

/** The image the cropper edits, loaded by the browser once the file is known to be editable. */
async function loadSource(target: MediaAsset): Promise<void> {
  const url = await editingSource(api, target).catch(() => null);
  if (asset.value?.id !== target.id) return;
  if (url) source.value = url;
  else sourceFailed.value = true;
}

async function retry(): Promise<void> {
  sourceFailed.value = false;
  await detailsRead.refresh();
  attempt.value += 1;
}

function onCropperReady(): void {
  isCropperReady.value = true;
  const description = asset.value?.alt || asset.value?.name || "";
  stage.value
    ?.querySelectorAll("img")
    .forEach((image) => (image.alt = description));
}

async function rotate(angle: number): Promise<void> {
  const keepsWholeImage = !cropChanged.value;
  rotation.value = (rotation.value + angle + FULL_TURN) % FULL_TURN;
  cropper.value?.rotate(angle, { transitions: false });
  if (!keepsWholeImage) return;
  await nextTick();
  cropper.value?.setCoordinates(fullImage);
  cropper.value?.refresh();
}

function reset(): void {
  if (rotation.value)
    cropper.value?.rotate(-rotation.value, { transitions: false });
  rotation.value = 0;
  aspect.value = FREE_ASPECT_ID;
  cropper.value?.reset();
}

function setCropField(
  field: keyof CropCoordinates,
  value: string | number,
): void {
  const coordinates = change.value?.coordinates;
  const pixels = Number(value);
  if (!coordinates || !Number.isFinite(pixels)) return;
  cropper.value?.setCoordinates({
    ...coordinates,
    [field]: pixels / pixelScale.value,
  });
}

function nudgeCrop(event: KeyboardEvent): void {
  const step = KEY_STEPS[event.key];
  const coordinates = change.value?.coordinates;
  const size = rotatedSize.value;
  if (!step || !coordinates || !size) return;
  event.preventDefault();
  const distance = Math.max(
    1,
    Math.round(Math.max(size.width, size.height) * NUDGE_RATIO),
  );
  cropper.value?.setCoordinates(
    event.shiftKey
      ? {
          ...coordinates,
          width: coordinates.width + step.x * distance,
          height: coordinates.height + step.y * distance,
        }
      : {
          ...coordinates,
          left: coordinates.left + step.x * distance,
          top: coordinates.top + step.y * distance,
        },
  );
}

function normalizedCrop() {
  const coordinates = change.value?.coordinates;
  const size = rotatedSize.value;
  if (!coordinates || !size || !cropChanged.value) return undefined;
  const clamp = (value: number) => Math.min(Math.max(value, 0), 1);
  const x = clamp(coordinates.left / size.width);
  const y = clamp(coordinates.top / size.height);
  return {
    x,
    y,
    width: Math.min(clamp(coordinates.width / size.width), 1 - x),
    height: Math.min(clamp(coordinates.height / size.height), 1 - y),
  };
}

const operations = (): TransformOperations => ({
  crop: normalizedCrop(),
  rotate: rotation.value || undefined,
});

const { save, saveCopy, revert } = useEditorSaving({
  asset,
  isSaving,
  hasChanges,
  operations,
  api,
  toast,
  t,
  confirm,
});

function leave(): void {
  void navigateDms(
    assetId.value && asset.value ? fileLink(assetId.value) : MEDIA_ROUTES.files,
  );
}

const notEditableDescription = computed(() =>
  asset.value?.mimetype === VECTOR_MIMETYPE
    ? t("dms_media.editor.not_editable_vector")
    : t("dms_media.editor.not_editable_formats"),
);

watch(
  () =>
    [
      isMounted.value && isEditable.value ? asset.value?.id : undefined,
      attempt.value,
    ] as const,
  ([id]) => {
    source.value = null;
    sourceFailed.value = false;
    resetEdits();
    if (id && asset.value) void loadSource(asset.value);
  },
  { immediate: true },
);
watch(stencilRatio, async (ratio) => {
  await nextTick();
  cropper.value?.refresh();
  if (!ratio) return;
  cropper.value?.setCoordinates(({ imageSize: size }) =>
    centeredRegion({ left: 0, top: 0, ...size }, ratio),
  );
});
watch(aspects, (options) => {
  if (!options.some((option) => option.id === aspect.value))
    aspect.value = ORIGINAL_ASPECT_ID;
});

definePageShortcuts(() => ({
  meta_s: { usingInput: true, handler: () => void save() },
  escape: leave,
}));
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex flex-wrap items-start gap-3">
      <UButton
        icon="i-ph-arrow-left"
        color="neutral"
        variant="outline"
        square
        :aria-label="t('dms_media.actions.back')"
        @click="leave"
      />
      <div class="min-w-0 flex-1">
        <h1
          class="text-highlighted truncate text-2xl font-semibold tracking-tight"
        >
          {{
            asset
              ? t("dms_media.editor.heading", { name: asset.name })
              : t("dms_media.editor.title")
          }}
        </h1>
        <p v-if="isEditing" class="text-muted mt-1 text-sm">
          {{ t("dms_media.editor.description") }}
        </p>
      </div>
    </header>
    <DmsEmptyState
      v-if="loadState === 'missing'"
      variant="error"
      :title="t('dms_media.file.not_found')"
      :description="t('dms_media.file.not_found_description')"
      :actions="[
        { label: t('dms_media.overview.open_library'), to: MEDIA_ROUTES.files },
      ]"
    />
    <DmsEmptyState
      v-else-if="loadState === 'error'"
      variant="error"
      :title="t('dms_media.editor.load_failed')"
      :description="t('dms_media.editor.load_failed_description')"
      :actions="[
        {
          label: t('dms_media.actions.retry'),
          icon: 'i-ph-arrow-clockwise',
          onClick: retry,
        },
      ]"
    />
    <DmsEmptyState
      v-else-if="asset && !isEditable"
      variant="no-access"
      icon="i-ph-image-broken"
      :title="t('dms_media.editor.not_editable')"
      :description="notEditableDescription"
      :actions="[
        {
          label: t('dms_media.editor.back_to_file'),
          icon: 'i-ph-arrow-left',
          to: fileLink(asset.id),
        },
      ]"
    />
    <div
      v-else
      class="dms-card grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_300px]"
    >
      <div
        class="relative flex min-h-[480px] flex-col bg-[conic-gradient(var(--dms-bg-muted)_90deg,transparent_90deg_180deg,var(--dms-bg-muted)_180deg_270deg,transparent_270deg)] [background-size:20px_20px]"
      >
        <div
          ref="stage"
          class="focus-visible:outline-primary min-h-0 flex-1 rounded-md p-4 focus-visible:outline-2 focus-visible:-outline-offset-2"
          tabindex="0"
          role="group"
          :aria-label="t('dms_media.editor.crop_area')"
          :aria-description="t('dms_media.editor.crop_area_keys')"
          @keydown="nudgeCrop"
        >
          <Cropper
            v-if="source"
            ref="cropper"
            class="media-editor-cropper h-[56vh] max-h-[640px]"
            :src="source"
            :canvas="false"
            :check-orientation="false"
            :stencil-props="{ aspectRatio: stencilRatio }"
            image-restriction="stencil"
            auto-zoom
            :default-size="fullImage"
            @ready="onCropperReady"
            @change="change = $event"
          />
          <USkeleton v-else class="h-[56vh] w-full" />
        </div>
        <ImageEditorToolbar
          :disabled="!isCropperReady"
          @rotate="rotate"
          @zoom="cropper?.zoom($event)"
          @reset="reset"
        />
      </div>
      <aside
        class="border-default flex flex-col border-s max-lg:border-s-0 max-lg:border-t"
      >
        <ImageEditorAspects
          v-model="aspect"
          :options="aspects"
          :label-of="aspectLabel"
        />
        <section v-if="change" class="border-default border-b p-4">
          <DmsEyebrowLabel
            :label="t('dms_media.editor.crop_area')"
            tone="muted"
            class="mb-2"
          />
          <div class="grid grid-cols-4 gap-1.5">
            <label
              v-for="field in cropFields"
              :key="field.key"
              class="flex flex-col gap-0.5"
            >
              <span class="text-dimmed font-mono text-[10px]">{{
                field.label
              }}</span>
              <UInput
                type="number"
                size="xs"
                min="0"
                :model-value="toPixels(change.coordinates[field.key])"
                :aria-label="field.label"
                @change="
                  setCropField(
                    field.key,
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
          </div>
        </section>
        <section class="border-default border-b p-4">
          <DmsEyebrowLabel
            :label="t('dms_media.editor.pending')"
            tone="muted"
            class="mb-2"
          />
          <ul v-if="pending.length" class="flex flex-col gap-1.5 text-[13px]">
            <li
              v-for="item in pending"
              :key="item.label"
              class="flex items-center gap-2"
            >
              <UIcon :name="item.icon" class="text-primary size-4" />
              <span class="text-highlighted flex-1">{{ item.label }}</span>
              <span class="text-dimmed font-mono text-[11px]">{{
                item.detail
              }}</span>
            </li>
          </ul>
          <p v-else class="text-dimmed text-[13px]">
            {{ t("dms_media.editor.no_changes") }}
          </p>
        </section>
        <section
          v-if="change && presetPreviews.length"
          class="border-default border-b p-4"
        >
          <DmsEyebrowLabel
            :label="t('dms_media.editor.sizes')"
            tone="muted"
            class="mb-2"
          />
          <div class="flex flex-wrap gap-3">
            <div
              v-for="preview in presetPreviews"
              :key="preview.id"
              class="flex flex-col gap-1"
            >
              <Preview
                :width="preview.width"
                :height="preview.height"
                :image="change.image"
                :coordinates="preview.coordinates"
                class="rounded-md"
              />
              <span class="text-dimmed font-mono text-[11px]">{{
                preview.label
              }}</span>
            </div>
          </div>
        </section>
        <section v-if="asset" class="border-default border-b p-4">
          <DmsEyebrowLabel
            :label="t('dms_media.editor.original')"
            tone="muted"
            class="mb-2"
          />
          <p class="text-muted flex items-start gap-2 text-[13px]">
            <UIcon
              name="i-ph-shield-check"
              class="text-success mt-0.5 size-4 shrink-0"
            />
            {{
              asset.hasOriginal
                ? t("dms_media.editor.original_kept")
                : t("dms_media.editor.original_first")
            }}
          </p>
          <UButton
            v-if="asset.hasOriginal"
            class="mt-2"
            variant="link"
            color="warning"
            icon="i-ph-arrow-counter-clockwise"
            :label="t('dms_media.editor.revert_to_original')"
            @click="revert()"
          />
        </section>
        <ImageEditorFooter
          :pending-count="pending.length"
          :is-saving="isSaving"
          @save="save"
          @save-copy="saveCopy"
          @discard="leave"
        />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.media-editor-cropper :deep(.vue-advanced-cropper__background) {
  background: transparent;
}

.media-editor-cropper :deep(.vue-advanced-cropper__foreground) {
  background: var(--ui-bg);
  opacity: 0.6;
}
</style>
