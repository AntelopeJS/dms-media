<script setup lang="ts">
import { usePickerExplorer } from "../../composables/picker/usePickerExplorer";

const { t } = useI18n();
const { focusedFile } = usePickerExplorer();
</script>

<template>
	<aside
		class="hidden w-72 shrink-0 overflow-y-auto border-s border-default p-4 sm:block"
	>
		<DmsMediaPickerPreviewBody v-if="focusedFile" :file="focusedFile" />
		<div
			v-else
			class="flex h-full min-h-52 flex-col items-center justify-center gap-2.5 p-4 text-center text-xs text-dimmed"
		>
			<UIcon name="i-lucide-eye" class="size-6" />
			{{ t("dms_media.picker.preview_empty") }}
		</div>
	</aside>
</template>
