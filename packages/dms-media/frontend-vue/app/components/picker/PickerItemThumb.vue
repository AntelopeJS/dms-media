<script setup lang="ts">
import type { MockItemPublic } from "../../utils/finder/models";
import { resolveFileGroup } from "../../utils/finder/filegroup";
import { getExtensionLabel } from "../../utils/finder/mime";
import { isPickerFile } from "../../composables/picker/usePickerExplorer";

interface Props {
	item: MockItemPublic;
	compact?: boolean;
}

const props = defineProps<Props>();

const file = computed(() =>
	isPickerFile(props.item) ? props.item : undefined,
);
const group = computed(() =>
	file.value ? resolveFileGroup(file.value.mimetype) : undefined,
);
const extensionLabel = computed(() =>
	file.value ? getExtensionLabel(file.value.mimetype) : "",
);
</script>

<template>
	<div v-if="!file" class="grid size-full place-items-center">
		<UIcon name="i-ph-folder-fill" class="size-[54%] text-primary/40" />
	</div>
	<img
		v-else-if="file.preview"
		:src="file.preview"
		:alt="file.name"
		class="size-full object-cover"
		draggable="false"
	/>
	<div
		v-else
		class="relative grid size-full place-items-center"
		:class="group?.tint"
	>
		<UIcon :name="group?.icon ?? 'i-ph-file'" :class="compact ? 'size-1/2' : 'size-1/3'" />
		<span
			v-if="!compact"
			class="absolute bottom-[8%] rounded-md bg-default px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase shadow-sm"
		>
			{{ extensionLabel }}
		</span>
	</div>
</template>
