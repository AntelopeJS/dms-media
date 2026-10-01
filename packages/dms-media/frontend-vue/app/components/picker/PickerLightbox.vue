<script setup lang="ts">
import type { FileItemPublic } from "../../utils/finder/models";
import {
	PICKER_DISMISS_GRACE_MS,
	usePickerExplorer,
} from "../../composables/picker/usePickerExplorer";

interface Props {
	file: FileItemPublic;
}

const props = defineProps<Props>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const api = useMediaApi();
const { isEditableImage, editFile, downloadFile } = usePickerExplorer();

const sourceUrl = ref<string>();
const isLoading = ref(true);
const loadFailed = ref(false);

const mountedAt = Date.now();

type LightboxKind = "image" | "video" | "pdf" | "other";

const KIND_MATCHERS: Array<{
	kind: LightboxKind;
	matches: (mimetype: string) => boolean;
}> = [
	{ kind: "image", matches: (mimetype) => mimetype.startsWith("image/") },
	{ kind: "video", matches: (mimetype) => mimetype.startsWith("video/") },
	{ kind: "pdf", matches: (mimetype) => mimetype === "application/pdf" },
];

const kind = computed<LightboxKind>(
	() =>
		KIND_MATCHERS.find((matcher) => matcher.matches(props.file.mimetype))
			?.kind ?? "other",
);

async function loadSource(): Promise<void> {
	isLoading.value = true;
	loadFailed.value = false;
	try {
		const { url } = await api.fetchReadUrl(props.file.id);
		sourceUrl.value = url;
	} catch {
		loadFailed.value = true;
	} finally {
		isLoading.value = false;
	}
}

onMounted(loadSource);

async function editAndRefresh(): Promise<void> {
	const changed = await editFile(props.file);
	if (changed) await loadSource();
}

function handleOpenChange(open: boolean): void {
	if (open) return;
	if (Date.now() - mountedAt < PICKER_DISMISS_GRACE_MS) return;
	emit("close");
}
</script>

<template>
	<UModal
		:open="true"
		class="h-[calc(100dvh-3rem)] max-h-none w-[calc(100vw-3rem)] max-w-none overflow-hidden"
		@update:open="handleOpenChange"
	>
		<template #content>
			<div class="flex h-full min-h-0 flex-col bg-default">
				<header
					class="flex items-center gap-3 border-b border-default px-4 py-3"
				>
					<h2 class="min-w-0 flex-1 truncate text-sm font-semibold text-highlighted">
						{{ file.name }}
					</h2>
					<UButton
						v-if="isEditableImage(file)"
						icon="i-lucide-crop"
						variant="outline"
						color="neutral"
						size="sm"
						:label="t('dms.finder.actions.edit_image')"
						@click="editAndRefresh"
					/>
					<UButton
						icon="i-lucide-download"
						variant="outline"
						color="neutral"
						size="sm"
						square
						:aria-label="t('dms.finder.actions.download')"
						@click="downloadFile(file)"
					/>
					<UButton
						icon="i-lucide-x"
						variant="ghost"
						color="neutral"
						square
						@click="emit('close')"
					/>
				</header>
				<div
					class="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-elevated/60 p-4"
				>
					<UIcon
						v-if="isLoading"
						name="i-lucide-loader-circle"
						class="size-8 animate-spin text-dimmed"
					/>
					<div
						v-else-if="loadFailed"
						class="flex flex-col items-center gap-3 text-center text-sm text-muted"
					>
						<UIcon name="i-lucide-file-x" class="size-8 text-dimmed" />
						{{ t("dms_media.picker.preview_error") }}
					</div>
					<img
						v-else-if="kind === 'image' && sourceUrl"
						:src="sourceUrl"
						:alt="file.name"
						class="max-h-full max-w-full object-contain"
					/>
					<video
						v-else-if="kind === 'video' && sourceUrl"
						:src="sourceUrl"
						controls
						class="max-h-full max-w-full"
					/>
					<iframe
						v-else-if="kind === 'pdf' && sourceUrl"
						:src="sourceUrl"
						:title="file.name"
						class="size-full rounded-lg border border-default bg-default"
					/>
					<div
						v-else
						class="flex flex-col items-center gap-3 text-center text-sm text-muted"
					>
						<span
							class="relative size-24 overflow-hidden rounded-xl shadow-sm"
						>
							<DmsMediaPickerItemThumb :item="file" />
						</span>
						{{ t("dms_media.picker.no_preview") }}
					</div>
				</div>
			</div>
		</template>
	</UModal>
</template>
