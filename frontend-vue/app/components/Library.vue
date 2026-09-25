<script setup lang="ts">
import { useElementBounding, useResizeObserver } from "@vueuse/core";

const { t } = useI18n();

// The files card fills the rest of the viewport, so the page itself does not
// scroll. The DMS layout drops page components into plain block containers,
// so there is no flex parent to fill: the height comes from the viewport,
// minus where the card actually starts (dashboard header, page header and the
// storage card above it all vary). Before the first measurement (SSR,
// pre-mount) no height is applied and the min-h floor takes over.
const filesCard = ref<HTMLElement | null>(null);
const { top: filesCardTop, update: measureFilesCard } =
	useElementBounding(filesCard);
// The storage card grows once its stats load and pushes the files card down;
// the bounding above only reacts to the files card's own size, so re-measure
// when the library (which grows with the storage card) resizes.
const libraryRoot = ref<HTMLElement | null>(null);
useResizeObserver(libraryRoot, () => measureFilesCard());
// Room left below the card, matching the layout panel's bottom padding.
const FILES_CARD_BOTTOM_GAP_PX = 24;
const filesCardHeight = computed(() =>
	filesCardTop.value > 0
		? `calc(100dvh - ${Math.round(filesCardTop.value)}px - ${FILES_CARD_BOTTOM_GAP_PX}px)`
		: undefined,
);
</script>

<template>
	<div ref="libraryRoot" class="flex min-h-0 flex-1 flex-col gap-4">
		<DmsCard>
			<DmsMediaStorageOverview />
		</DmsCard>
		<DmsCard
			ref="filesCard"
			:padded="false"
			class="flex min-h-96 flex-col overflow-hidden"
			:style="{ height: filesCardHeight }"
		>
			<DmsMediaPickerExplorer
				browse
				:title="t('dms_media.library.files_title')"
				class="min-h-0 flex-1"
			/>
		</DmsCard>
	</div>
</template>
