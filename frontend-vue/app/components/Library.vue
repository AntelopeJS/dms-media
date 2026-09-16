<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
	<div class="flex min-h-0 flex-1 flex-col gap-4 pb-12">
		<DmsCard>
			<DmsMediaStorageOverview />
		</DmsCard>
		<DmsCard
			:padded="false"
			class="flex h-[calc(100dvh-14rem)] min-h-[560px] flex-col overflow-hidden"
		>
			<DmsMediaPickerExplorer
				browse
				:title="t('dms_media.library.files_title')"
				class="min-h-0 flex-1"
			/>
		</DmsCard>
	</div>
</template>
