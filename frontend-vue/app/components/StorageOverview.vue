<script setup lang="ts">
import {
	FILTERABLE_FILE_GROUPS,
	resolveFileGroup,
} from "../utils/finder/filegroup";
import { formatFileSize } from "../utils/finder/filesize";

const { t } = useI18n();
const store = useFinderStore();

const PERCENT_SCALE = 100;
const MIN_SEGMENT_PERCENT = 1;

interface StorageSlice {
	id: string;
	label: string;
	count: number;
	size: number;
	barClass: string;
}

const usageByGroup = computed(() => {
	const usage = new Map<string, { count: number; size: number }>();
	for (const file of store.items.value.files) {
		const group = resolveFileGroup(file.mimetype);
		const entry = usage.get(group.id) ?? { count: 0, size: 0 };
		entry.count += 1;
		entry.size += file.size;
		usage.set(group.id, entry);
	}
	return usage;
});

const slices = computed<StorageSlice[]>(() =>
	FILTERABLE_FILE_GROUPS.filter((group) => usageByGroup.value.has(group.id)).map(
		(group) => {
			const entry = usageByGroup.value.get(group.id) as {
				count: number;
				size: number;
			};
			return {
				id: group.id,
				label: t(group.labelKey),
				count: entry.count,
				size: entry.size,
				barClass: group.barClass,
			};
		},
	),
);

const totalSize = computed(() =>
	slices.value.reduce((total, slice) => total + slice.size, 0),
);
const totalCount = computed(() =>
	slices.value.reduce((total, slice) => total + slice.count, 0),
);

function segmentWidth(slice: StorageSlice): string {
	if (totalSize.value === 0) return "0%";
	const share = (slice.size / totalSize.value) * PERCENT_SCALE;
	return `${Math.max(MIN_SEGMENT_PERCENT, share)}%`;
}
</script>

<template>
	<div class="flex flex-col gap-4">
		<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
			<span class="text-2xl font-bold text-highlighted">
				{{ formatFileSize(totalSize) }}
			</span>
			<span class="text-sm text-muted">
				{{ t("dms_media.storage.used", { count: totalCount }) }}
			</span>
		</div>
		<div
			v-if="totalCount"
			class="flex h-2.5 overflow-hidden rounded-full bg-elevated"
		>
			<div
				v-for="slice in slices"
				:key="slice.id"
				class="h-full transition-[width]"
				:class="slice.barClass"
				:style="{ width: segmentWidth(slice) }"
			/>
		</div>
		<div v-if="totalCount" class="flex flex-wrap gap-x-6 gap-y-2">
			<div
				v-for="slice in slices"
				:key="slice.id"
				class="flex items-center gap-2 text-sm"
			>
				<span class="size-2.5 rounded-full" :class="slice.barClass" />
				<span class="font-medium text-highlighted">{{ slice.label }}</span>
				<span class="text-muted">
					{{ slice.count }} · {{ formatFileSize(slice.size) }}
				</span>
			</div>
		</div>
		<div v-else class="text-sm text-muted">
			{{ t("dms_media.storage.empty") }}
		</div>
	</div>
</template>
