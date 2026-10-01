<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
	<!-- The page fills the panel (`fillHeight` in src/pages/media.ts): the files
	     card takes the height the storage card leaves, and the explorer scrolls
	     inside it. The card keeps a usable height of its own: on a short screen
	     the panel scrolls rather than squeeze the explorer. -->
	<div class="flex min-h-0 flex-1 flex-col gap-4">
		<DmsCard>
			<DmsMediaStorageOverview />
		</DmsCard>
		<DmsCard
			:padded="false"
			class="flex min-h-96 flex-1 flex-col overflow-hidden"
		>
			<DmsMediaPickerExplorer
				browse
				:title="t('dms_media.library.files_title')"
				class="min-h-0 flex-1"
			/>
		</DmsCard>
	</div>
</template>
