<script setup lang="ts">
import type { FileItemPublic } from "../utils/finder/models";

interface Props {
	bindingId?: string;
	mimetypes?: string[];
	multiple?: boolean;
	initialSelectedIds?: string[];
}

const props = defineProps<Props>();

const emit = defineEmits<{ close: [files: FileItemPublic[] | null] }>();

const open = defineModel<boolean>("open", { default: false });

const hasEmitted = ref(false);

function closeWith(files: FileItemPublic[] | null): void {
	if (hasEmitted.value) return;
	hasEmitted.value = true;
	emit("close", files);
	open.value = false;
}

watch(open, (value) => {
	if (!value) closeWith(null);
});
</script>

<template>
	<UModal
		v-model:open="open"
		class="h-[min(880px,calc(100dvh-2rem))] max-h-none w-[min(1440px,calc(100vw-2rem))] max-w-none overflow-hidden"
	>
		<template #content>
			<DmsMediaPickerExplorer
				:multiple="props.multiple"
				:mimetypes="props.mimetypes"
				:initial-selected-ids="props.initialSelectedIds"
				:initial-binding="props.bindingId"
				@confirm="closeWith($event)"
				@cancel="closeWith(null)"
			/>
		</template>
	</UModal>
</template>
